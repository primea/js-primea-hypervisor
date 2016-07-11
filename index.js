const Environment = require('./testEnvironment.js')
const Interface = require('./interface.js')

module.exports = class BaseStateTranitions {
  // runs some code in the VM
  constructor (state) {
    this.state = state
  }

  // handles running code
  static codeHandler (code, environment) {
    const ethInterface = new Interface(environment)
    const instance = Wasm.instantiateModule(code, ethInterface)
    ethInterface.setModule(ethInterface)
    return instance
  }

  // loads code from the merkle trie and run it
  // callHandler (msg, code) {
  //   const instance = Wasm.instantiateModule(code, interface)
  //   interface.setModule(instance)
  //   return instance
  // }

  // Builtin contracts
  // run code

  // run tx
  // runTx () {}

  // run block
  // runBlock () {}

  // run blockchain
  // runBlockchain () {}
}
