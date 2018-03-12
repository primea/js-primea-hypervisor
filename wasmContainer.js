const {wasm2json, json2wasm} = require('wasm-json-toolkit')
const wasmMetering = require('wasm-metering')
const ReferanceMap = require('reference-map')
const Message = require('./message.js')
const customTypes = require('./customTypes.js')
const injectGlobals = require('./injectGlobals.js')
const typeCheckWrapper = require('./typeCheckWrapper.js')
const {FunctionRef, ModuleRef, DEFAULTS} = require('./systemObjects.js')

const nativeTypes = new Set(['i32', 'i64', 'f32', 'f64'])
const LANGUAGE_TYPES = {
  0x0: 'actor',
  0x1: 'buf',
  0x02: 'elem',
  0x03: 'link',
  0x04: 'id',
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x70: 'anyFunc',
  0x60: 'func',
  0x40: 'block_type'
}
const FUNC_INDEX_OFFSET = 1

function generateWrapper (funcRef, container) {
  let wrapper = typeCheckWrapper(funcRef.params)
  const wasm = json2wasm(wrapper)
  const mod = WebAssembly.Module(wasm)
  const self = funcRef
  wrapper = WebAssembly.Instance(mod, {
    'env': {
      'checkTypes': function () {
        const args = [...arguments]
        const checkedArgs = []
        while (args.length) {
          const type = LANGUAGE_TYPES[args.shift()]
          let arg = args.shift()
          if (!nativeTypes.has(type)) {
            arg = container.refs.get(arg, type)
          }
          checkedArgs.push(arg)
        }
        const message = new Message({
          funcRef: self,
          funcArguments: checkedArgs
        }).on('execution:error', e => {
          console.log(e)
        })
        container.actor.send(message)
      }
    }
  })
  wrapper.exports.check.object = funcRef
  return wrapper
}

module.exports = class WasmContainer {
  constructor (actor) {
    this.actor = actor
    this.refs = new ReferanceMap()
  }

  static createModule (wasm, id) {
    if (!WebAssembly.validate(wasm)) {
      throw new Error('invalid wasm binary')
    }

    let moduleJSON = wasm2json(wasm)
    const json = customTypes.mergeTypeSections(moduleJSON)
    moduleJSON = wasmMetering.meterJSON(moduleJSON, {
      meterType: 'i32'
    })

    // initialize the globals
    let numOfGlobals = json.globals.length
    if (numOfGlobals) {
      moduleJSON = injectGlobals(moduleJSON, json.globals)
    }
    // recompile the wasm
    wasm = json2wasm(moduleJSON)
    const modRef = ModuleRef.fromMetaJSON(json, id)
    return {
      wasm,
      json,
      modRef
    }
  }

  static onCreation (unverifiedWasm, id, tree) {
    const {modRef} = this.createModule(unverifiedWasm, id)
    return modRef
  }

  getInterface (funcRef) {
    const self = this
    return {
      func: {
        externalize: index => {
          const func = this.instance.exports.table.get(index)
          const object = func.object
          if (object) {
            // externalize a pervously internalized function
            return self.refs.add(object)
          } else {
            const params = self.json.types[self.json.indexes[func.name - FUNC_INDEX_OFFSET]].params
            const ref = new FunctionRef(true, func.tableIndex, params, self.actor.id)
            return self.refs.add(ref, 'func')
          }
        },
        internalize: (index, ref) => {
          const funcRef = self.refs.get(ref, 'func')
          const wrapper = generateWrapper(funcRef, self)
          this.instance.exports.table.set(index, wrapper.exports.check)
        },
        catch: (ref, catchRef) => {
          const {funcRef} = self.refs.get(ref, FunctionRef)
          const {funcRef: catchFunc} = self.refs.get(ref, FunctionRef)
          funcRef.catch = catchFunc
        },
        get_gas_budget: (funcRef) => {
          const func = self.refs.get(funcRef, 'func')
          return func.gas
        },
        set_gas_budget: (funcRef, amount) => {
          const func = self.refs.get(funcRef, 'func')
          func.gas = amount
        }
      },
      link: {
        wrap: ref => {
          const obj = this.refs.get(ref)
          const link = {'/': obj}
          return this.refs.add(link, 'link')
        },
        unwrap: async (ref, cb) => {
          const obj = this.refs.get(ref, 'link')
          const promise = this.actor.tree.dataStore.get(obj)
          await this._opsQueue.push(promise)
          // todo
        }
      },
      module: {
        new: dataRef => {
          const mod = this.actor.createActor(dataRef)
          return this.refs.add(mod, 'mod')
        },
        export: (modRef, bufRef) => {
          const mod = this.refs.get(modRef, 'mod')
          let name = this.refs.get(bufRef, 'buf')
          name = Buffer.from(name).toString()
          const funcRef = mod.getFuncRef(name)
          return this.refs.add(funcRef, 'func')
        },
        self: () => {
          return this.refs.add(this.modSelf, 'mod')
        }
      },
      memory: {
        externalize: (index, length) => {
          const buf = Buffer.from(this.get8Memory(index, length))
          return this.refs.add(buf, 'buf')
        },
        internalize: (dataRef, srcOffset, sinkOffset, length) => {
          let buf = this.refs.get(dataRef, 'buf')
          buf = buf.subarray(srcOffset, length)
          const mem = this.get8Memory(sinkOffset, buf.length)
          mem.set(buf)
        },
        length (dataRef) {
          let buf = this.refs.get(dataRef, 'buf')
          return buf.length
        }
      },
      table: {
        externalize: (index, length) => {
          const mem = Buffer.from(this.get8Memory(index, length * 4))
          const objects = []
          while (length--) {
            const ref = mem.readUInt32LE(length * 4)
            const obj = this.refs.get(ref)
            objects.unshift(obj)
          }
          return this.refs.add(objects, 'elem')
        },
        internalize: (elemRef, srcOffset, sinkOffset, length) => {
          let table = this.refs.get(elemRef, 'elem')
          const buf = table.slice(srcOffset, srcOffset + length).map(obj => this.refs.add(obj))
          const mem = this.get32Memory(sinkOffset, length)
          mem.set(buf)
        },
        length (elemRef) {
          let elem = this.refs.get(elemRef, 'elem')
          return elem.length
        }
      },
      metering: {
        usegas: amount => {
          this.actor.incrementTicks(amount)
          // funcRef.gas -= amount
          if (funcRef.gas < 0) {
            throw new Error('out of gas! :(')
          }
        }
      }
    }
  }

  async onMessage (message) {
    const funcRef = message.funcRef
    const intef = this.getInterface(funcRef)
    this.instance = WebAssembly.Instance(this.mod, intef)
    // map table indexes
    const table = this.instance.exports.table
    if (table) {
      let length = table.length
      while (length--) {
        const func = table.get(length)
        if (func) {
          func.tableIndex = length
        }
      }
    }
    // import references
    const args = message.funcArguments.map((arg, index) => {
      const type = funcRef.params[index]
      if (nativeTypes.has(type)) {
        return arg
      } else {
        return this.refs.add(arg, type)
      }
    })

    // setup globals
    let numOfGlobals = this.json.globals.length
    if (numOfGlobals) {
      const refs = []
      while (numOfGlobals--) {
        const obj = this.actor.storage[numOfGlobals] || DEFAULTS[this.json.globals[numOfGlobals].type]
        refs.push(this.refs.add(obj, this.json.globals[numOfGlobals].type))
      }
      this.instance.exports.setter_globals(...refs)
    }

    // call entrypoint function
    if (funcRef.private) {
      this.instance.exports.table.get(funcRef.identifier)(...args)
    } else {
      this.instance.exports[funcRef.identifier](...args)
    }
    await this.onDone()

    // store globals
    numOfGlobals = this.json.globals.length
    if (numOfGlobals) {
      this.actor.storage = []
      this.instance.exports.getter_globals()
      const mem = this.get32Memory(0, numOfGlobals)
      while (numOfGlobals--) {
        const ref = mem[numOfGlobals]
        this.actor.storage.push(this.refs.get(ref, this.json.globals[numOfGlobals].type))
      }
    }

    this.refs.clear()
  }

  /**
   * returns a promise that resolves when the wasm instance is done running
   * @returns {Promise}
   */
  async onDone () {
    let prevOps
    while (prevOps !== this._opsQueue) {
      prevOps = this._opsQueue
      await prevOps
    }
  }

  /**
   * Pushed an async operation to the a promise queue that
   * @returns {Promise} the returned promise resolves in the order the intail
   * operation was pushed to the queue
   */
  pushOpsQueue (promise) {
    this._opsQueue = Promise.all([this._opsQueue, promise])
    return this._opsQueue
  }

  async onStartup () {
    const code = this.actor.code
    const {json, wasm, modRef} = WasmContainer.createModule(code, this.actor.id)
    this.mod = WebAssembly.Module(wasm)
    this.json = json
    this.modSelf = modRef
  }

  get8Memory (offset, length) {
    return new Uint8Array(this.instance.exports.memory.buffer, offset, length)
  }

  get32Memory (offset, length) {
    return new Uint32Array(this.instance.exports.memory.buffer, offset, length)
  }

  static get typeId () {
    return 9
  }
}
