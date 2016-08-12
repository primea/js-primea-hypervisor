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
  codeHandler (code, ethInterface = new Interface(new Environment())) {
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
  callHandler (address, gaslimit, gasprice, value, data) {
    var account = this.environment.state.get(new Uint8Array(address).toString())
    if (!account) {
      throw new Error('Account not found')
    }

    const code = this.environment.state.get(account.codeHash)

    if (!code) {
      throw new Error('Contract not found')
    }

    if (!Utils.isWASMCode(code)) {
      throw new Error('Not an eWASM contract')
    }

    // creats a new Kernel
    const environment = new Environment(data)
    environment.parent = this

    //environment.setCallHandler(callHandler)

    const kernel = new Kernel(this, environment)
    kernel.codeHandler(code, new Interface(environment))

    // generate new stateroot
    //this.environment.state.set(address, { stateRoot: stateRoot })

    return {
      executionOutcome: 1, // success
      gasLeft: 0,
      gasRefunds: 0,
      returnValue: new ArrayBuffer(),
      selfDestructAddress: new Uint8Array(),
      logs: []
    }
  }

  // run tx; the tx message handler
  runTx (tx, environment = new Environment()) {
    // verify tx then send to call Handler
    // - from account has enough balance
    // - check nonce
    // - ecrecover
    // new ethTx(tx).validate(tx)
    // - reduce balance

    this.environment = environment

    // Contract deployment
    //const isDeployment = tx.data && !tx.to;
    //if (isDeployment) {
    //  this.environment.accounts.set(new Uint8Array())
    //}

    //
    // environment.state - the merkle tree
    // key: address (20 byte, hex string, without 0x prefix)
    // every path has an account
    //
    // { balance, codeHash, stateRoot }
    //

    // look up sender
    let fromAccount = this.environment.state.get(new Uint8Array(tx.form).toString())

    // deduct gasLimit * gasPrice from sender
    if (fromAccount.balance < (tx.gasLimit * tx.gasPrice)) {
      throw new Error('Insufficient account balance')
    }

    fromAccount.balance -= ts.gasLimit * tx.gasPrice

    let ret = this.callHandler(tx.to, tx.gasLimit, tx.gasPrice, tx.value, tx.data)

    // refund gas
    if (ret.executionOutcome === 1) {
      fromAccount.balance += (ret.gasLeft + ret.gasRefund) * tx.gasPrice
    }

    // save new state?

    return {
      returnValue: ret.returnValue,
      gasLeft: ret.gasLeft,
      logs: ret.logs
    }
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
