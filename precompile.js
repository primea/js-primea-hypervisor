module.exports.meteringInjector = function (call) {
  console.log('Executing metering injector')
  return {
    returnValue: call.data.slice(0)
  }
}

module.exports.transcompiler = function (call) {
  console.log('Executing transcompiler')
  return {
    returnValue: call.data.slice(0)
  }
}
