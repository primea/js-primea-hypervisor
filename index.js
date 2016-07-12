/**
 * This implements the Ethereum Kernel
 * The kernal handles the following
 * - Interprocess communications
 * - Intializing the VM and exposes ROM to it (codeHandler)
 * - Expose namespace which VM instance exists and Intializes the Environment (callHandler)
 * - Provides some built in contract (runTx, runBlock)
 * - Provides resource sharing and limiting via gas
 *
 *   All State should be stored in the Environment.
 */
// const Environment = require('./environment.js')
const Interface = require('./interface.js')

module.exports = class Kernal {
  // runs some code in the VM
  constructor (nameState) {
    this.state = nameState
  }

  // handles running code. `code` can be seen as ROM here
  static codeHandler (code, environment) {
    const ethInterface = new Interface(environment)
    const instance = Wasm.instantiateModule(code, ethInterface)
    ethInterface.setModule(ethInterface)
    return instance
  }

  // loads code from the merkle trie and delegates the message
  static call (path, data, environment) {
    // const instance = Wasm.instantiateModule(code, interface)
    // interface.setModule(instance)
    // return instance
  }

  // run tx
  runTx (tx, environment) {
    // verify tx then send to call Handler
    this.call(tx, environment)
  }

  // run block
  runBlock (block, environment) {
    // verify block then run each tx
    block.tx.forEach((tx) => {
      this.runTx(tx, environment)
    })

  }

  // run blockchain
  // runBlockchain () {}
}
