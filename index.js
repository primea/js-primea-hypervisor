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
const Environment = require('./environment.js')

module.exports = class Kernal {
  // runs some code in the VM
  constructor (nameState) {
    this.state = nameState
  }

  // handles running code.
  static codeHandler (code, ethInterface = new Interface()) {
    const instance = Wasm.instantiateModule(code, {
      'ethereum': ethInterface
    })

    ethInterface.setModule(instance)
    if (instance.exports.main) {
      instance.exports.main()
    }
    return instance
  }

  // loads code from the merkle trie and delegates the message
  // Detects if code is EVM or WASM
  // Detects if the code injection is needed
  // Detects if transcompilation is needed
  static callHandler (path, data, environment = new Environment()) {
    // return instance
  }

  // run tx; the tx message handler
  runTx (tx, environment = new Environment()) {
    // verify tx then send to call Handler
    this.callHandler(tx, environment)
  }

  // run block; the block message handler
  runBlock (block, environment = new Environment()) {
    // verify block then run each tx
    block.tx.forEach((tx) => {
      this.runTx(tx, environment)
    })
  }

  // run blockchain
  // runBlockchain () {}
}
