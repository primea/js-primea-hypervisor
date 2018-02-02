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

class Ref {
  serialize () {}
}

class FunctionRef {
  constructor (json, name) {
    this.name = name
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
  constructor () {
    this.refs = new ReferanceMap()
  }
  onCreation (wasm) {
    let moduleJSON = wasm2json(wasm)
    this.json = mergeTypeSections(moduleJSON)
    moduleJSON = wasmMetering.meterJSON(moduleJSON, {
      meterType: 'i32'
    })
    this.wasm = json2wasm(moduleJSON)
    this.mod = WebAssembly.Module(this.wasm)
  }

  sendMessage () {
    console.log('send')
  }

  onMessage (funcRef) {
    const self = this
    const instance = WebAssembly.Instance(this.mod, {
      func: {
        externalize: () => {},
        internalize: (ref, index) => {
          const {type, arg} = self.refs.get(ref, FunctionRef)
          arg.container = self
          instance.exports.table.set(index, arg.wrapper.exports.check)
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
        usegas: () => {}
      }
    })
    const args = funcRef.args.map(arg => {
      if (nativeTypes.has(arg.type)) {
        return arg.arg
      } else {
        return this.refs.add(arg)
      }
    })
    instance.exports[funcRef.name](...args)
  }

  getFuncRef (name, send) {
    const funcRef = new FunctionRef(this.json, name, send)
    return funcRef
  }
}

function mergeTypeSections (json) {
  const typeInfo = {}
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
