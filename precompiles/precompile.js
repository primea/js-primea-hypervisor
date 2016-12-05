// const evm2wasm = require('evm2wasm')
// const metering = require('wasm-metering')

function craftResponse (status, msg) {
  // NOTE: why does this has to be so hard?
  return Uint8Array.from(Buffer.concat([ new Buffer([ status ]), new Buffer(msg) ]))
}

module.exports.meteringInjector = function (call) {
  console.log('Executing metering injector')
  return {
    // returnValue: metering.injectWAST(call.data, 2).slice(0)
    returnValue: craftResponse(0, call.data)
  }
}

module.exports.transcompiler = function (call) {
  console.log('Executing transcompiler')
  return {
    // returnValue: evm2wasm.compileEVM(call.data).slice(0)
    returnValue: craftResponse(1, 'Code not supported: ' + Buffer.from(call.data.slice(0, 8)).toString('hex') + '...')
  }
}

module.exports.identity = function (call) {
  return {
    returnValue: call.data.slice(0)
  }
}
