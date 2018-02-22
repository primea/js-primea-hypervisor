const {wasm2json, json2wasm} = require('wasm-json-toolkit')
const wasmMetering = require('wasm-metering')
const ReferanceMap = require('reference-map')
const leb128 = require('leb128')
const Message = require('./message.js')
const customTypes = require('./customTypes.js')
const injectGlobals = require('./injectGlobals.js')
const typeCheckWrapper = require('./typeCheckWrapper.js')

const nativeTypes = new Set(['i32', 'i64', 'f32', 'f64'])
const LANGUAGE_TYPES = {
  'actor': 0x0,
  'buf': 0x1,
  'elem': 0x2,
  'i32': 0x7f,
  'i64': 0x7e,
  'f32': 0x7d,
  'f64': 0x7c,
  'anyFunc': 0x70,
  'func': 0x60,
  'block_type': 0x40,

  0x0: 'actor',
  0x1: 'buf',
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x70: 'anyFunc',
  0x60: 'func',
  0x40: 'block_type'
}

class ElementBuffer {
  static get type () {
    return 'elem'
  }
  constructor (array) {
    this._array = array
  }

  serialize () {
    const serialized = this._array.map(ref => ref.serailize())
    return Buffer.concat(Buffer.from([LANGUAGE_TYPES['elem']]), leb128.encode(serialized.length), serialized)
  }

  static deserialize (serialized) {}
}

class DataBuffer {
  static get type () {
    return 'data'
  }
  constructor (memory, offset, length) {
    this._data = new Uint8Array(this.instance.exports.memory.buffer, offset, length)
  }
  serialize () {
    return Buffer.concat(Buffer.from([LANGUAGE_TYPES['elem']]), leb128.encode(this._data.length), this._data)
  }
  static deserialize (serialized) {}
}

class LinkRef {
  static get type () {
    return 'link'
  }
  serialize () {
    return Buffer.concat(Buffer.from([LANGUAGE_TYPES['link'], this]))
  }
  static deserialize (serialized) {}
}

class FunctionRef {
  static get type () {
    return 'func'
  }

  constructor (type, identifier, json, id) {
    this.type = type
    this.destId = id
    let funcIndex
    if (type === 'export') {
      this.indentifier = identifier
      funcIndex = json.exports[identifier]
    } else {
      this.indentifier = identifier.tableIndex
      funcIndex = Number(identifier.name) - 1
    }
    const typeIndex = json.indexes[funcIndex]
    const funcType = json.types[typeIndex]

    const wrapper = typeCheckWrapper(funcType)
    const wasm = json2wasm(wrapper)
    const mod = WebAssembly.Module(wasm)
    const self = this
    this.wrapper = WebAssembly.Instance(mod, {
      'env': {
        'checkTypes': function () {
          const args = [...arguments]
          const checkedArgs = []
          while (args.length) {
            const type = LANGUAGE_TYPES[args.shift()]
            let arg = args.shift()
            if (!nativeTypes.has(type)) {
              arg = self._container.refs.get(arg, type)
            }
            checkedArgs.push(arg)
          }
          const message = new Message({
            funcRef: self,
            funcArguments: checkedArgs
          })
          self._container.actor.send(message)
        }
      }
    })
    this.wrapper.exports.check.object = this
  }
  set container (container) {
    this._container = container
  }
}

class ModuleRef {
  static get type () {
    return 'mod'
  }

  constructor (json, id) {
    this._json = json
    this.id = id
  }

  getFuncRef (name) {
    return new FunctionRef('export', name, this._json, this.id)
  }

  serialize () {
    return this._json
  }

  static deserialize (serialized) {}
}

module.exports = class WasmContainer {
  constructor (actor) {
    this.actor = actor
    this.refs = new ReferanceMap()
  }

  static async onCreation (wasm, id, cachedb) {
    // if (!WebAssembly.validate(wasm)) {
    //   throw new Error('invalid wasm binary')
    // }
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
    return new ModuleRef(json, id)
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
          const funcRef = self.refs.get(ref)
          funcRef.container = self
          this.instance.exports.table.set(index, funcRef.wrapper.exports.check)
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
          const link = new LinkRef(obj.serialize())
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
          return this.refs.add(this.moduleObj, 'mod')
        }
      },
      memory: {
        externalize: (index, length) => {
          const buf = this.getMemory(index, length)
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
          const eleBuf = new ElementBuffer(objects)
          return this.refs.add(eleBuf, 'elem')
        },
        internalize: (elemRef, srcOffset, sinkOffset, length) => {
          let table = this.refs.get(elemRef, 'elem')
          const buf = table._array.slice(srcOffset, srcOffset + length).map(obj => this.refs.add(obj))
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
    const args = message.funcArguments.map(arg => {
      if (typeof arg === 'number') {
        return arg
      } else {
        return this.refs.add(arg, arg.constructor.type)
      }
    })
    if (funcRef.type === 'export') {
      this.instance.exports[funcRef.indentifier](...args)
    } else {
      this.instance.exports.table.get(funcRef.indentifier)(...args)
    }
    await this.onDone()
    this.refs.clear()
    if (this.json.globals.length) {
      this.instance.exports.getter_globals()
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

  getFuncRef (name, send) {
    const funcRef = new FunctionRef(this.json, name, send)
    return funcRef
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
    this.moduleObj = new ModuleRef(json, this.actor.id)
  }

  getMemory (offset, length) {
    return new Uint8Array(this.instance.exports.memory.buffer, offset, length)
  }

  static get typeId () {
    return 9
  }
}
