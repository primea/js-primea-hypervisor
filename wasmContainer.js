const {wasm2json, json2wasm} = require('wasm-json-toolkit')
const wasmMetering = require('wasm-metering')
const ReferanceMap = require('reference-map')
const Message = require('./message.js')
const customTypes = require('./customTypes.js')
const injectGlobals = require('./injectGlobals.js')
const typeCheckWrapper = require('./typeCheckWrapper.js')

const nativeTypes = new Set(['i32', 'i64', 'f32', 'f64'])
const LANGUAGE_TYPES = {
  'actor': 0x0,
  'buf': 0x1,
  'elem': 0x2,
  'link': 0x3,
  'id': 0x4,
  'i32': 0x7f,
  'i64': 0x7e,
  'f32': 0x7d,
  'f64': 0x7c,
  'anyFunc': 0x70,
  'func': 0x60,
  'block_type': 0x40,

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

class FunctionRef {
  constructor (location, identifier, params, id) {
    this.location = location
    this.identifier = identifier
    this.destId = id
    this.params = params

  }

  generateWrapper (container) {
    let wrapper = typeCheckWrapper(this.params)
    const wasm = json2wasm(wrapper)
    const mod = WebAssembly.Module(wasm)
    const self = this
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
          })
          container.actor.send(message)
        }
      }
    })
    wrapper.exports.check.object = this
    return wrapper
  }

  encodeCBOR (gen) {
    return gen.write({
      '>': {}
    })
  }

  set container (container) {
    this._container = container
  }
}

class ModuleRef {
  constructor (ex, id) {
    this.exports = ex
    this.id = id
  }

  getFuncRef (name) {
    return new FunctionRef('export', name, this.exports[name], this.id)
  }

  encodeCBOR (gen) {
    return gen.write({
      '#': {
        exports: this.exports,
        id: {
          '@': this.id
        }
      }
    })
  }

  static fromMetaJSON (json, id) {
    const exports = {}
    for (const ex in json.exports) {
      const type = json.types[json.indexes[json.exports[ex].toString()]].params
      exports[ex] = type
    }
    return new ModuleRef(exports, id)
  }

  static deserialize (serialized) {}
}

module.exports = class WasmContainer {
  constructor (actor) {
    this.actor = actor
    this.refs = new ReferanceMap()
  }

  static async onCreation (wasm, id, cachedb) {
    if (!WebAssembly.validate(wasm)) {
      throw new Error('invalid wasm binary')
    }
    let moduleJSON = wasm2json(wasm)
    const json = customTypes.mergeTypeSections(moduleJSON)
    moduleJSON = wasmMetering.meterJSON(moduleJSON, {
      meterType: 'i32'
    })
    if (json.globals.length) {
      moduleJSON = injectGlobals(moduleJSON, json.globals)
    }
    wasm = json2wasm(moduleJSON)
    await Promise.all([
      new Promise((resolve, reject) => {
        cachedb.put(id.toString() + 'meta', JSON.stringify(json), resolve)
      }),
      new Promise((resolve, reject) => {
        cachedb.put(id.toString() + 'code', wasm.toString('hex'), resolve)
      })
    ])
    return ModuleRef.fromMetaJSON(json, id)
  }

  getInterface (funcRef) {
    const self = this
    return {
      func: {
        externalize: index => {
          const func = this.instance.exports.table.get(index)
          const object = func.object
          if (object) {
            return self.refs.add(object)
          } else {
            const ref = new FunctionRef('table', object.tableIndex, self.json, self.actor.id)
            return self.refs.add(ref)
          }
        },
        internalize: (ref, index) => {
          const funcRef = self.refs.get(ref, 'func')
          const wrapper = funcRef.generateWrapper(self)
          this.instance.exports.table.set(index, wrapper.exports.check)
        },
        catch: (ref, catchRef) => {
          const {funcRef} = self.refs.get(ref, FunctionRef)
          const {funcRef: catchFunc} = self.refs.get(ref, FunctionRef)
          funcRef.catch = catchFunc
        },
        getGasAmount: (funcRef) => {},
        setGasAmount: (funcRef) => {}
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
        new: code => {},
        exports: (modRef, offset, length) => {
          const mod = this.refs.get(modRef, 'mod')
          let name = this.getMemory(offset, length)
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
          const buf = Buffer.from(this.getMemory(index, length))
          return this.refs.add(buf, 'buf')
        },
        internalize: (dataRef, srcOffset, sinkOffset, length) => {
          let buf = this.refs.get(dataRef, 'buf')
          buf = buf.subarray(srcOffset, length)
          const mem = this.getMemory(sinkOffset, buf.length)
          mem.set(buf)
        }
      },
      table: {
        externalize: (index, length) => {
          const mem = Buffer.from(this.getMemory(index, length * 4))
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
          const mem = new Uint32Array(this.instance.exports.memory.buffer, sinkOffset, length)
          mem.set(buf)
        }
      },
      metering: {
        usegas: amount => {
          funcRef.gas -= amount
          if (funcRef.gas < 0) {
            throw new Error('out of gas! :(')
          }
        }
      }
    }
  }

  async onMessage (message) {
    try {
    const funcRef = message.funcRef
    const intef = this.getInterface(funcRef)
    this.instance = WebAssembly.Instance(this.mod, intef)
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
    const args = message.funcArguments.map((arg, index) => {
      const type = funcRef.params[index]
      if (nativeTypes.has(type)) {
        return arg
      } else {
        return this.refs.add(arg, type)
      }
    })
    if (funcRef.location === 'export') {
      this.instance.exports[funcRef.identifier](...args)
    } else {
      this.instance.exports.table.get(funcRef.identifier)(...args)
    }
    await this.onDone()

    let numOfGlobals = this.json.globals.length
    if (numOfGlobals) {
      const storage = []
      this.instance.exports.getter_globals()
      const mem = new Uint32Array(this.instance.exports.memory.buffer, 0, numOfGlobals)
      while (numOfGlobals--) {
        const ref = mem[numOfGlobals]
        storage.push(this.refs.get(ref, this.json.globals[numOfGlobals].type))
      }
      this.actor.state.set(Buffer.from([1]), storage)
    }

    this.refs.clear()
    } catch (e) {
      console.log(e)
    }
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
    let [json, wasm] = await Promise.all([
      new Promise((resolve, reject) => {
        this.actor.cachedb.get(this.actor.id.toString() + 'meta', (err, json) => {
          if (err) {
            reject(err)
          } else {
            resolve(json)
          }
        })
      }),
      new Promise((resolve, reject) => {
        this.actor.cachedb.get(this.actor.id.toString() + 'code', (err, wasm) => {
          if (err) {
            reject(err)
          } else {
            resolve(wasm)
          }
        })
      })
    ])
    wasm = Buffer.from(wasm, 'hex')
    json = JSON.parse(json)
    this.mod = WebAssembly.Module(wasm)
    this.json = json
    this.modSelf = ModuleRef.fromMetaJSON(json, this.actor.id)
  }

  getMemory (offset, length) {
    return new Uint8Array(this.instance.exports.memory.buffer, offset, length)
  }

  static get typeId () {
    return 9
  }
}
