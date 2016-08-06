/**
 * This implements the Ethereum Kernel
 * Kernels must implement two methods `codeHandler` and `callHandler` (and `linkHandler` for sharding)
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

// The Kernel Exposes this Interface to VM instances it makes
const Interface = require('./interface.js')

// The Kernel Stores all of its state in the Environment. The Interface is used
// to by the VM to retrive infromation from the Environment.
const Environment = require('./environment.js')

const DebugInterface = require('./debugInterface.js')

const Utils = require('./utils.js')

module.exports = class Kernel {
  // runs some code in the VM
  constructor (environment = new Environment()) {
    this.environment = environment
  }

  // handles running code.
  // NOTE: it assumes that wasm will raise an exception if something went wrong,
  //       otherwise execution succeeded
  static codeHandler (code, ethInterface = new Interface(new Environment())) {
    const debugInterface = new DebugInterface(ethInterface.environment)

    const instance = Wasm.instantiateModule(code, {
      'ethereum': ethInterface.exportTable,
      'debug': debugInterface.exportTable,

      // export this for Rust
      // FIXME: remove once Rust has proper imports, see https://github.com/ethereum/evm2.0-design/issues/15
      'spectest': ethInterface.exportTable,

      // export this for Binaryen
      // FIXME: remove once C has proper imports, see https://github.com/ethereum/evm2.0-design/issues/16
      'env': ethInterface.exportTable
    })

    ethInterface.setModule(instance)
    debugInterface.setModule(instance)

    if (instance.exports.main) {
      instance.exports.main()
    }
    return instance
  }

  // loads code from the merkle trie and delegates the message
  // Detects if code is EVM or WASM
  // Detects if the code injection is needed
  // Detects if transcompilation is needed
  callHandler (path, data) {
    // creats a new Kernel
    const environment = new Environment(data)
    // environment.parent = this
    const kernel = new Kernel(this, environment)
    const code = this.environment.state.get(path)
    if (!code) {
      throw new Error('Contract not found')
    }
    if (!Utils.isWASMCode(code)) {
      throw new Error('Not an eWASM contract')
    }
    kernel.codeHandler(code, new Interface(environment))
  }

  // run tx; the tx message handler
  runTx (tx, environment = new Environment()) {
    // verify tx then send to call Handler
    // - from account has enough balance
    // - check nonce
    // - ecrecover
    // new ethTx(tx).validate(tx)
    // - reduce balance

    // Contract deployment
    const isDeployment = tx.data && !tx.to;
    if (isDeployment) {
      this.environment.accounts.set(new Uint8Array())
    }

    var toAccount = this.environment.accounts.get(new Uint8Array(tx.to).toString())
    var fromAccount = this.environment.accounts.get(new Uint8Array(tx.form).toString())

    if (!toAccount) {
      throw new Error('Account not found')
    }

    this.callHandler(account.codeHash, environment)
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
