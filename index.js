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

const Address = require('./address.js')
const U256 = require('./u256.js')
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
    let account = this.environment.state.get(address.toString())
    if (!account) {
      throw new Error('Account not found')
    }

    const code = Uint8Array.from(account.get('code'))
    if (code.length === 0) {
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
      gasLeft: new U256(environment.gasLimit), // this starts as the limit and results as the gas left
      gasRefund: new U256(environment.gasRefund),
      returnValue: environment.returnValue,
      selfDestructAddress: environment.selfDestructAddress,
      logs: environment.logs
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

    //
    // environment.state - the merkle tree
    // key: address (20 byte, hex string, without 0x prefix)
    // every path has an account
    //
    // { balance, codeHash, stateRoot }
    //

    // look up sender
    let fromAccount = this.environment.state.get(tx.from.toString())
    if (!fromAccount) {
      throw new Error('Sender account not found')
    }

    // Special case: contract deployment
    if (tx.to.isZero()) {
      if (tx.data.length !== 0) {
        console.log('This is a contract deployment transaction')

        let account = new Map()
        account.set('nonce', new U256(0))
        account.set('balance', tx.value)
        account.set('code', tx.data)
        account.set('storage', new Map())

        // FIXME: calculate the contract address
        let address = tx.to

        this.environment.state.set(address.toString(), account)

        // FIXME: deduct fees

        return {
          accountCreated: address
        }
      }
    }

    // deduct gasLimit * gasPrice from sender
    if (fromAccount.get('balance').lt(tx.gasLimit.mul(tx.gasPrice))) {
      throw new Error(`Insufficient account balance: ${fromAccount.get('balance').toString()} < ${tx.gasLimit.mul(tx.gasPrice).toString()}`)
    }

    fromAccount.set('balance', fromAccount.get('balance').sub(tx.gasLimit.mul(tx.gasPrice)))

    let ret = this.callHandler(tx.to, tx.gasLimit, tx.gasPrice, tx.value, tx.data)

    // refund gas
    if (ret.executionOutcome === 1) {
      fromAccount.set('balance', fromAccount.get('balance').add(tx.gasPrice.mul(ret.gasLeft.add(ret.gasRefund))))
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
