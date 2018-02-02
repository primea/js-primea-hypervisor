const LANGUAGE_TYPES = {
  'actor': 0x0,
  'buf': 0x1,
  'i32': 0x7f,
  'i64': 0x7e,
  'f32': 0x7d,
  'f64': 0x7c,
  'anyFunc': 0x70,
  'func': 0x60,
  'block_type': 0x40
}

module.exports = function generateWrapper (type) {
  const module = [{
    'name': 'preramble',
    'magic': [
      0,
      97,
      115,
      109
    ],
    'version': [
      1,
      0,
      0,
      0
    ]
  }, {
    'name': 'type',
    'entries': [{
      'form': 'func',
      'params': [
      ]
    }, {
      'form': 'func',
      'params': [
        // imported check
      ]
    }, {
      'form': 'func',
      'params': [
        // exported check
      ]
    }, {
      'form': 'func',
      'params': [
        // invoke
      ]
    }]
  }, {
    'name': 'import',
    'entries': [{
      'moduleStr': 'env',
      'fieldStr': 'checkTypes',
      'kind': 'function',
      'type': 0
    }]
  }, {
    'name': 'function',
    'entries': [
      1,
      2
    ]
  }, {
    'name': 'table',
    'entries': [{
      'elementType': 'anyFunc',
      'limits': {
        'flags': 1,
        'intial': 1,
        'maximum': 1
      }
    }]
  }, {
    'name': 'global',
    'entries': []
  }, {
    'name': 'export',
    'entries': [{
      'field_str': 'table',
      'kind': 'table',
      'index': 0
    }, {
      'field_str': 'invoke',
      'kind': 'function',
      'index': 2
    }, {
      'field_str': 'check',
      'kind': 'function',
      'index': 1
    }]
  }, {
    'name': 'code',
    'entries': [{
      'locals': [],
      'code': []
    }, {
      'locals': [],
      'code': []
    }]
  }]
  const definedTypes = new Set(['actor', 'func', 'buf'])
  const setGlobals = []
  const importType = module[1].entries[0].params
  const checkType = module[1].entries[1].params
  const invokerType = module[1].entries[2].params
  const invokeType = module[1].entries[3].params
  const checkCode = module[7].entries[0].code
  const invokeCode = module[7].entries[1].code

  type.params.forEach((param, index) => {
    let baseType = param
    const typeCode = LANGUAGE_TYPES[param]
    // import type
    if (definedTypes.has(param)) {
      baseType = 'i32'
    } else {
      baseType = param
    }

    // check import
    importType.push('i32')
    importType.push('i32')
    checkCode.push({
      'return_type': 'i32',
      'name': 'const',
      'immediates': typeCode
    })
    checkCode.push({
      'name': 'get_local',
      'immediates': index
    })
    invokeCode.push({
      'name': 'get_local',
      'immediates': index
    })
    // check export
    checkType.push(baseType)
    // invoke
    invokeType.push(baseType)
    invokerType.push(baseType)
  })

  module[7].entries[0].code = checkCode.concat(setGlobals, [{
    'name': 'call',
    'immediates': '0'
  }, {
    'name': 'end'
  }])
  invokeCode.push({
    'return_type': 'i32',
    'name': 'const',
    'immediates': '0'
  })
  invokeCode.push({
    'name': 'call_indirect',
    'immediates': {
      'index': 3,
      'reserved': 0
    }
  })
  invokeCode.push({
    'name': 'end'
  })
  return module
}
