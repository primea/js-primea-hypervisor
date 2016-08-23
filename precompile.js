// const evm2wasm = require('evm2wasm')
// const metering = require('wasm-metering')

module.exports.meteringInjector = function (call) {
  console.log('Executing metering injector')
  return {
    // returnValue: metering.injectWAST(call.data, 2).slice(0)
    returnValue: call.data.slice(0)
  }
}

module.exports.transcompiler = function (call) {
  console.log('Executing transcompiler')
  return {
    // returnValue: evm2wasm.compileEVM(call.data).slice(0)
    returnValue: call.data.slice(0)
  }
}
