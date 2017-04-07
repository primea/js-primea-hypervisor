const Wasm = require('primea-wasm-container')

const defaultHandler = {
  test: (state) => {
    return !state.code
  },
  init: () => {
    return require('./defaultAgent.js')
  }
}

const wasm = {
  test: (state) => {
    const code = Buffer.from(state.code)
    return code && code.slice(0, 4).toString() === '\x00asm'
  },
  init: (code) => {
    return new Wasm(code)
  }
}

const javascript = {
  test: (state) => {
    return typeof state.code === 'function'
  },
  init: (state) => {
    return {
      run: state.code
    }
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
