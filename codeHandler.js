const Wasm = require('./vm.js')

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
    return code && code.slice(0, 4).toString() === '\x00asm'
  },
  init: (code) => {
    return new Wasm(code)
  }
}

let codeHandlers = exports.codeHandlers = [
  defaultHandler,
  wasm
]

exports.init = (code) => {
  for (let handler of codeHandlers) {
    if (handler.test(code)) {
      return handler.init(code)
    }
  }
}
