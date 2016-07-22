/**
 * This implements the Ethereum Kernel
 * The Kernel Contract handles the following
 * - Interprocess communications
 * - Intializing the VM and exposes ROM to it (codeHandler)
 * - Expose namespace which VM instance exists and Intializes the Environment (callHandler)
 * - Provides some built in contract (runTx, runBlock)
 * - Provides resource sharing and limiting via gas
 *
 *   All State should be stored in the Environment.
 *
 */
// const Environment = require('./environment.js')
//
// The Kernel Exposes this Interface to VM instances it makes
const Interface = require('./interface.js')
// The Kernel Stores all of its state in the Environment. The Interface is used
// to by the VM to retrive infromation from the Environment.
const Environment = require('./environment.js')

module.exports = class Kernal {
  // runs some code in the VM
  constructor (environment = new Environment()) {
    this.environment = environment
  }

  // handles running code.
  static codeHandler (code, ethInterface) {
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
  static callHandler (path, data) {
    // creats a new Kernal
    // const environment = new Environment(data)
    // environment.parent = this
    // const kernel = new Kernel(this, environment)
    // kernel.codeHandler(code)
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
