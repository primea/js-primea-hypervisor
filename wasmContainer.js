const {wasm2json, json2wasm} = require('wasm-json-toolkit')
const wasmMetering = require('wasm-metering')
const customTypes = require('./customTypes.js')
const typeCheckWrapper = require('./typeCheckWrapper.js')
const ReferanceMap = require('reference-map')

const nativeTypes = new Set(['i32', 'i64', 'f32', 'f64'])
const LANGUAGE_TYPES = {
  'actor': 0x0,
  'buf': 0x1,
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

class FunctionRef {
  constructor (name, json, id) {
    this.name = name
    this.destId = id
    this.args = []
    const typeIndex = json.typeMap[name]
    const type = json.type[typeIndex]
    const wrapper = typeCheckWrapper(type)
    const wasm = json2wasm(wrapper)
    this.mod = WebAssembly.Module(wasm)
    const self = this
    const instance = WebAssembly.Instance(this.mod, {
      'env': {
        'checkTypes': function () {
          const args = [...arguments]
          while (args.length) {
            const type = LANGUAGE_TYPES[args.shift()]
            let arg = args.shift()
            if (!nativeTypes.has(type)) {
              arg = self._container.refs.get(arg)
              if (arg.type !== type) {
                throw new Error('invalid type')
              }
            }
            self.args.push({
              arg,
              type
            })
          }
          self._container.sendMessage(instance)
        }
      }
    })
    this.wrapper = instance
  }
  set container (container) {
    this._container = container
  }
}

module.exports = class WasmContainer {
  constructor (actor) {
    this.actor = actor
    this.refs = new ReferanceMap()
  }

  static onCreation (wasm, id, cachedb) {
    WebAssembly.validate(wasm)
    let moduleJSON = wasm2json(wasm)
    const json = mergeTypeSections(moduleJSON)
    moduleJSON = wasmMetering.meterJSON(moduleJSON, {
      meterType: 'i32'
    })
    wasm = json2wasm(moduleJSON)
    cachedb.put(id.toString() + 'meta', json)
    cachedb.put(id.toString() + 'code', wasm.toString('hex'))
    const refs = {}
    Object.keys(json.typeMap).forEach(key => {
      refs[key] = new FunctionRef(key, json, id)
    })
    return refs
  }

  sendMessage () {
    console.log('send')
  }

  getInteface (funcRef) {
    const self = this
    return {
      func: {
        externalize: () => {},
        internalize: (ref, index) => {
          const {type, arg} = self.refs.get(ref)
          if (type !== 'funcRef') {
            throw new Error('invalid type')
          }
          arg.container = self
          this.instance.exports.table.set(index, arg.wrapper.exports.check)
        },
        catch: (ref, catchRef) => {
          const {funcRef} = self.refs.get(ref, FunctionRef)
          const {funcRef: catchFunc} = self.refs.get(ref, FunctionRef)
          funcRef.catch = catchFunc
        },
        getGasAmount: () => {},
        setGasAmount: () => {}
      },
      storage: {
        load: () => {},
        store: () => {},
        delete: () => {}
      },
      link: {
        wrap: (ref) => {
          const obj = this.refs.get(ref)
          obj.seriarlize()
        },
        unwrap: () => {}
      },
      databuf: {
        create: () => {},
        load8: () => {},
        load16: () => {},
        load32: () => {},
        load64: () => {},
        store8: () => {},
        store16: () => {},
        store32: () => {},
        store64: () => {},
        copy: () => {}
      },
      elembuf: {
        create: () => {},
        load: () => {},
        store: () => {},
        delete: () => {}
      },
      test: {
        check: (a, b) => {
          console.log('$$$$', a, b)
        }
      },
      metering: {
        usegas: (amount) => {
          funcRef.gas -= amount
          if (funcRef.gas < 0) {
            throw new Error('out of gas! :(')
          }
        }
      }
    }
  }

  onMessage (message) {
    const funcRef = message.funcRef
    const intef = this.getInteface(funcRef)
    this.instance = WebAssembly.Instance(this.mod, intef)
    const args = message.funcArguments.map(arg => {
      if (typeof arg === 'number') {
        return arg
      } else {
        return this.refs.add(arg)
      }
    })
    this.instance.exports[funcRef.name](...args)
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
    this.mod = WebAssembly.Module(wasm)
    this.json = json
  }

  static get typeId () {
    return 9
  }
}

function mergeTypeSections (json) {
  const typeInfo = {
    typeMap: [],
    type: []
  }
  let typeSection = {
    'entries': []
  }
  let importSection = {
    'entries': []
  }
  let functionSection = {
    'entries': []
  }
  let exportSection = {
    'entries': []
  }
  json.forEach(section => {
    switch (section.name) {
      case 'type':
        typeSection = section
        break
      case 'export':
        exportSection = section
        break
      case 'import':
        importSection = section
        break
      case 'function':
        functionSection = section
        break
      case 'custom':
        switch (section.sectionName) {
          case 'type':
            typeInfo.type = customTypes.decodeType(section.payload)
            break
          case 'typeMap':
            typeInfo.typeMap = customTypes.decodeTypeMap(section.payload)
            break
        }
        break
    }
  })

  const foundTypes = new Map()
  const mappedFuncs = new Map()
  const newTypeMap = {}
  typeInfo.typeMap.forEach(map => mappedFuncs.set(map.func, map.type))
  for (let exprt of exportSection.entries) {
    if (exprt.kind === 'function') {
      if (!mappedFuncs.has(exprt.index)) {
        const typeIndex = functionSection.entries[exprt.index - importSection.entries.length]
        if (!foundTypes.has(typeIndex)) {
          const customIndex = typeInfo.type.push(typeSection.entries[typeIndex]) - 1
          foundTypes.set(typeIndex, customIndex)
        }
        const customIndex = foundTypes.get(typeIndex)
        newTypeMap[exprt.field_str] = customIndex
      } else {
        newTypeMap[exprt.field_str] = mappedFuncs.get(exprt.index)
      }
    }
  }

  typeInfo.typeMap = newTypeMap
  return typeInfo
}
