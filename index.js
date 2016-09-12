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
const Transaction = require('./transaction.js')
const Precompile = require('./precompile.js')

const identityContract = new Address('0x0000000000000000000000000000000000000004')
const meteringContract = new Address('0x000000000000000000000000000000000000000A')
const transcompilerContract = new Address('0x000000000000000000000000000000000000000B')

module.exports = class Kernel {
  // runs some code in the VM
  constructor (environment = new Environment()) {
    this.environment = environment

    this.environment.addAccount(identityContract, {})
    this.environment.addAccount(meteringContract, {})
    this.environment.addAccount(transcompilerContract, {})
  }

  // handles running code.
  // NOTE: it assumes that wasm will raise an exception if something went wrong,
  //       otherwise execution succeeded
  codeHandler (code, ethInterface = new Interface(new Environment())) {
    const debugInterface = new DebugInterface(ethInterface.environment)
    const module = WebAssembly.Module(code)
    const instance = WebAssembly.Instance(module, {
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
  callHandler (call) {
    // FIXME: this is here until these two contracts are compiled to WASM
    // The two special contracts (precompiles now, but will be real ones later)
    if (call.to.equals(meteringContract)) {
      return Precompile.meteringInjector(call)
    } else if (call.to.equals(transcompilerContract)) {
      return Precompile.transcompiler(call)
    } else if (call.to.equals(identityContract)) {
      return Precompile.identity(call)
    }

    let account = this.environment.state.get(call.to.toString())
    if (!account) {
      throw new Error('Account not found: ' + call.to.toString())
    }

    let code = Uint8Array.from(account.get('code'))
    if (code.length === 0) {
      throw new Error('Contract not found')
    }

    if (!Utils.isWASMCode(code)) {
      // throw new Error('Not an eWASM contract')

      // Transcompile code
      // FIXME: decide if these are the right values here: from: 0, gasLimit: 0, value: 0
      code = this.callHandler({ from: Address.zero(), to: transcompilerContract, gasLimit: 0, value: new U256(0), data: code }).returnValue

      if (code[0] === 0) {
        code = code.slice(1)
      } else {
        throw new Error('Transcompilation failed: ' + Buffer.from(code).slice(1).toString())
      }
    }

    // creats a new Kernel
    const environment = new Environment()
    environment.parent = this

    // copy the transaction details
    environment.code = code
    environment.address = call.to
    // FIXME: make distinction between origin and caller
    environment.origin = call.from
    environment.caller = call.from
    environment.callData = call.data
    environment.callValue = call.value
    environment.gasLeft = call.gasLimit

    environment.callHandler = this.callHandler.bind(this)
    environment.createHandler = this.createHandler.bind(this)

    const kernel = new Kernel(environment)
    kernel.codeHandler(code, new Interface(environment))

    // self destructed
    if (environment.selfDestruct) {
      const balance = this.state.get(call.to.toString()).get('balance')
      const beneficiary = this.state.get(environment.selfDestructAddress)
      beneficiary.set('balance', beneficiary.get('balance').add(balance))
      this.state.delete(call.to.toString())
    }

    // generate new stateroot
    // this.environment.state.set(address, { stateRoot: stateRoot })

    return {
      executionOutcome: 1, // success
      gasLeft: new U256(environment.gasLeft),
      gasRefund: new U256(environment.gasRefund),
      returnValue: environment.returnValue,
      selfDestruct: environment.selfDestruct,
      selfDestructAddress: environment.selfDestructAddress,
      logs: environment.logs
    }
  }

  createHandler (create) {
    let code = create.data

    // Inject metering
    if (Utils.isWASMCode(code)) {
      // FIXME: decide if these are the right values here: from: 0, gasLimit: 0, value: 0
      code = this.callHandler({ from: Address.zero(), to: meteringContract, gasLimit: 0, value: new U256(0), data: code }).returnValue

      if (code[0] === 0) {
        code = code.slice(1)
      } else {
        throw new Error('Metering injection failed: ' + Buffer.from(code).slice(1).toString())
      }
    }

    let address = Utils.newAccountAddress(create.from, code)

    this.environment.addAccount(address.toString(), {
      balance: create.value,
      code: code
    })

    // Run code and take return value as contract code
    // FIXME: decide if these are the right values here: value: 0, data: ''
    code = this.callHandler({ from: create.from, to: address, gasLimit: create.gasLimit, value: new U256(0), data: new Uint8Array() }).returnValue

    // FIXME: special handling for selfdestruct

    this.environment.state.get(address.toString()).set('code', code)

    return {
      executionOutcome: 1, // success
      gasLeft: new U256(this.environment.gasLeft),
      gasRefund: new U256(this.environment.gasRefund),
      accountCreated: address,
      logs: this.environment.logs
    }
  }

  // run tx; the tx message handler
  runTx (tx, environment = new Environment()) {
    this.environment = environment

    if (Buffer.isBuffer(tx) || typeof tx === 'string') {
      tx = new Transaction(tx)
      if (!tx.valid) {
        throw new Error('Invalid transaction signature')
      }
    }

    // look up sender
    let fromAccount = this.environment.state.get(tx.from.toString())
    if (!fromAccount) {
      throw new Error('Sender account not found: ' + tx.from.toString())
    }

    if (fromAccount.get('nonce').gt(tx.nonce)) {
      throw new Error(`Invalid nonce: ${fromAccount.get('nonce')} > ${tx.nonce}`)
    }

    fromAccount.set('nonce', fromAccount.get('nonce').add(new U256(1)))

    let isCreation = false

    // Special case: contract deployment
    if (tx.to.isZero() && (tx.data.length !== 0)) {
      console.log('This is a contract deployment transaction')
      isCreation = true
    }

    // This cost will not be refunded
    let txCost = 21000 + (isCreation ? 32000 : 0)
    tx.data.forEach((item) => {
      if (item === 0) {
        txCost += 4
      } else {
        txCost += 68
      }
    })

    if (tx.gasLimit.lt(new U256(txCost))) {
      throw new Error(`Minimum transaction gas limit not met: ${txCost}`)
    }

    if (fromAccount.get('balance').lt(tx.gasLimit.mul(tx.gasPrice))) {
      throw new Error(`Insufficient account balance: ${fromAccount.get('balance').toString()} < ${tx.gasLimit.mul(tx.gasPrice).toString()}`)
    }

    // deduct gasLimit * gasPrice from sender
    fromAccount.set('balance', fromAccount.get('balance').sub(tx.gasLimit.mul(tx.gasPrice)))

    const handler = isCreation ? this.createHandler.bind(this) : this.callHandler.bind(this)
    let ret = handler({
      to: tx.to,
      from: tx.from,
      gasLimit: tx.gasLimit - txCost,
      value: tx.value,
      data: tx.data
    })

    // refund unused gas
    if (ret.executionOutcome === 1) {
      fromAccount.set('balance', fromAccount.get('balance').add(tx.gasPrice.mul(ret.gasLeft.add(ret.gasRefund))))
    }

    // save new state?

    return {
      executionOutcome: ret.executionOutcome,
      accountCreated: isCreation ? ret.accountCreated : undefined,
      returnValue: isCreation ? undefined : ret.returnValue,
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
