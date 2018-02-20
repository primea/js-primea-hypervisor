const {findSections} = require('wasm-json-toolkit')
const wantedSections = ['type', 'import', 'function', 'export', 'code']

module.exports = function injectGlobals (json, globals) {
  const iter = findSections(json, wantedSections)
  const {value: type} = iter.next()
  const getterType = type.entries.push(typeEntry()) - 1
  const setterType = type.entries.push(typeEntry(Array(globals.length).fill('i32'))) - 1

  const {value: imports = {entries: []}} = iter.next()
  const {value: func} = iter.next()
  const getterIndex = func.entries.push(getterType) - 1 + imports.entries.length
  const setterIndex = func.entries.push(setterType) - 1 + imports.entries.length
  const {value: exports} = iter.next()
  exports.entries.push(exportEntry('getter_globals', getterIndex))
  exports.entries.push(exportEntry('setter_globals', setterIndex))
  const {value: code} = iter.next()
  const getterCode = []
  const setterCode = []
  globals.forEach((globalIndex, index) => {
    // getter
    getterCode.push(i32_const(index * 4))
    getterCode.push(get_global(globalIndex))
    getterCode.push(i32_store())
    // setter
    setterCode.push(get_local(index))
    setterCode.push(set_global(globalIndex))
  })

  getterCode.push(end())
  setterCode.push(end())
  code.entries.push(section_code([], getterCode))
  code.entries.push(section_code([], setterCode))
  return json
}

function exportEntry (field_str, index) {
  return {
    field_str,
    kind: 'function',
    index
  }
}

function typeEntry (params = []) {
  return {
    form: 'func',
    params: params
  }
}

function end () {
  return {
    name: 'end'
  }
}

function get_local (index) {
  return {
    name: 'get_local',
    immediates: index
  }
}

function get_global (index) {
  return {
    name: 'get_global',
    immediates: index
  }
}

function set_global (index) {
  return {
    name: 'set_global',
    immediates: index
  }
}

function i32_const (num) {
  return {
    'return_type': 'i32',
    'name': 'const',
    'immediates': num
  }
}

function i32_store () {
  return {
    'return_type': 'i32',
    'name': 'store',
    'immediates': {
      'flags': 2,
      'offset': 0
    }
  }
}

function section_code (locals, code) {
  return {
    locals: locals,
    code: code
  }
}
