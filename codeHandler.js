const Wasm = require('./wasmAgent.js')

const defaultHandler = {
  test: (code) => {
    return !code
  },
  init: () => {
    return require('./defaultAgent.js')
  }
}

const wasm = {
  test: (code) => {
    code = new Buffer(code)
    return code && code.slice(0, 4).toString() === '\x00asm'
  },
  init: (code) => {
    return new Wasm(code)
  }
}

const javascript = {
  test: (code) => {
    return typeof code === 'object'
  },
  init: (code) => {
    return code
  }
}

let codeHandlers = exports.handlers = {
  default: defaultHandler,
  wasm: wasm,
  javascript: javascript
}

exports.init = (code) => {
  for (let name in codeHandlers) {
    try {
      const handler = codeHandlers[name]
      if (handler.test(code)) {
        return handler.init(code)
      }
    } catch (e) {}
  }
}
