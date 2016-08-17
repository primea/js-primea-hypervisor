/**
 * This is the Ethereum interface that is exposed to the WASM instance which
 * enables to interact with the Ethereum Environment
 */
const constants = require('./constants.js')
const Address = require('./address.js')
const U256 = require('./u256.js')

// The interface exposed to the WebAessembly Core
module.exports = class Interface {
  constructor (environment) {
    this.environment = environment
  }

  get exportTable () {
    let exportMethods = [
      // include all the public methods according to the Ethereum Environment Interface (EEI) r1
      'useGas',
      'getGasLeft',
      'getAddress',
      'getBalance',
      'getTxOrigin',
      'getCaller',
      'getCallValue',
      'getCallDataSize',
      'callDataCopy',
      'getCodeSize',
      'codeCopy',
      'getExternalCodeSize',
      'externalCodeCopy',
      'getTxGasPrice',
      'getBlockHash',
      'getBlockCoinbase',
      'getBlockTimestamp',
      'getBlockNumber',
      'getBlockDifficulty',
      'getBlockGasLimit',
      'log',
      'create',
      'call',
      'callCode',
      'callDelegate',
      'storageStore',
      'storageLoad',
      'return',
      'selfDestruct'
    ]
    let ret = {}
    exportMethods.forEach((method) => {
      ret[method] = this[method].bind(this)
    })
    return ret
  }

  setModule (mod) {
    this.module = mod
  }

  /**
   * Subtracts an amount to the gas counter
   * @param {integer} amount the amount to subtract to the gas counter
   */
  useGas (amount) {
    if (amount < 0) {
      throw new Error('Negative gas deduction requested')
    }

    this.takeGas(amount)
  }

  /**
   * Returns the current amount of gas
   * @return {integer}
   */
  getGasLeft () {
    this.takeGas(2)

    return this.environment.gasLimit
  }

  /**
   * Gets address of currently executing account and loads it into memory at
   * the given offset.
   * @param {integer} offset
   */
  getAddress (offset) {
    this.takeGas(2)

    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.address)
  }

  /**
   * Gets balance of the given account and loads it into memory at the given
   * offset.
   * @param {integer} addressOffset the memory offset to laod the address
   * @param {integer} resultOffset
   */
  getBalance (addressOffset, offset) {
    this.takeGas(20)

    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    // call the parent contract and ask for the balance of one of its child contracts
    const balance = this.environment.parent.environment.getBalance(address)
    this.setMemory(offset, constants.BALANCE_SIZE_BYTES, balance.toBuffer(constants.BALANCE_SIZE_BYTES))
  }

  /**
   * Gets the execution's origination address and loads it into memory at the
   * given offset. This is the sender of original transaction; it is never an
   * account with non-empty associated code.
   * @param {integer} offset
   */
  getTxOrigin (offset) {
    this.takeGas(2)

    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.origin)
  }

  /**
   * Gets caller address and loads it into memory at the given offset. This is
   * the address of the account that is directly responsible for this execution.
   * @param {integer} offset
   */
  getCaller (offset) {
    this.takeGas(2)

    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.caller)
  }

  /**
   * Gets the deposited value by the instruction/transaction responsible for
   * this execution and loads it into memory at the given location.
   * @param {integer} offset
   */
  getCallValue (offset) {
    this.takeGas(2)

    this.setMemory(offset, constants.BALANCE_SIZE_BYTES, this.environment.callValue.toBuffer(constants.BALANCE_SIZE_BYTES))
  }

  /**
   * Get size of input data in current environment. This pertains to the input
   * data passed with the message call instruction or transaction.
   * @return {integer}
   */
  getCallDataSize () {
    this.takeGas(2)

    return this.environment.callData.length
  }

  /**
   * Copys the input data in current environment to memory. This pertains to
   * the input data passed with the message call instruction or transaction.
   * @param {integer} offset the offset in memory to load into
   * @param {integer} dataOffset the offset in the input data
   * @param {integer} length the length of data to copy
   */
  callDataCopy (offset, dataOffset, length) {
    this.takeGas(3 + ((length / 32) * 3))

    const callData = this.environment.callData.slice(dataOffset, dataOffset + length)
    this.setMemory(offset, length, callData)
  }

  /**
   * Gets the size of code running in current environment.
   * @return {interger}
   */
  getCodeSize () {
    this.takeGas(2)

    return this.environment.code.length
  }

  /**
   * Copys the code running in current environment to memory.
   * @param {integer} offset the memory offset
   * @param {integer} codeOffset the code offset
   * @param {integer} length the length of code to copy
   */
  codeCopy (resultOffset, codeOffset, length) {
    this.takeGas(3 + ((length / 32) * 3))

    const code = new Uint8Array(this.environment.code, codeOffset, length)
    this.setMemory(resultOffset, length, code)
  }

  /**
   * Get size of an account’s code.
   * @param {integer} addressOffset the offset in memory to load the address from
   * @return {integer}
   */
  getExternalCodeSize (addressOffset) {
    this.takeGas(20)

    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    const code = this.environment.getCode(address)
    return code.length
  }

  /**
   * Copys the code of an account to memory.
   * @param {integer} addressOffset the memory offset of the address
   * @param {integer} resultOffset the memory offset
   * @param {integer} codeOffset the code offset
   * @param {integer} length the length of code to copy
   */
  externalCodeCopy (addressOffset, resultOffset, codeOffset, length) {
    this.takeGas(20 + ((length / 32) * 3))

    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    let code = this.environment.getCode(address)
    code = new Uint8Array(code, codeOffset, length)
    this.setMemory(resultOffset, length, code)
  }

  /**
   * Gets price of gas in current environment.
   * @return {integer}
   */
  getTxGasPrice () {
    this.takeGas(2)

    return this.environment.gasPrice
  }

  /**
   * Gets the hash of one of the 256 most recent complete blocks.
   * @param {integer} number which block to load
   * @param {integer} offset the offset to load the hash into
   */
  getBlockHash (number, offset) {
    this.takeGas(20)

    const diff = this.environment.number - number
    let hash

    if (diff > 256 || diff <= 0) {
      hash = new U256(0)
    } else {
      hash = new U256(this.environment.getBlockHash(number))
    }
    this.setMemory(offset, 32, hash.toBuffer())
  }

  /**
   * Gets the block’s beneficiary address and loads into memory.
   * @param offset
   */
  getBlockCoinbase (offset) {
    this.takeGas(2)

    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.coinbase)
  }

  /**
   * Get the block’s timestamp.
   * @return {integer}
   */
  getBlockTimestamp () {
    this.takeGas(2)

    return this.environment.timestamp
  }

  /**
   * Get the block’s number.
   * @return {integer}
   */
  getBlockNumber () {
    this.takeGas(2)

    return this.environment.number
  }

  /**
   * Get the block’s difficulty.
   * @return {integer}
   */
  getBlockDifficulty () {
    this.takeGas(2)

    return this.environment.difficulty
  }

  /**
   * Get the block’s gas limit.
   * @return {integer}
   */
  getBlockGasLimit () {
    this.takeGas(2)

    return this.environment.gasLimit
  }

  /**
   * Creates a new log in the current environment
   * @param {integer} dataOffset the offset in memory to load the memory
   * @param {integer} length the data length
   * TODO: replace with variadic
   */
  log (dataOffset, length, topic1, topic2, topic3, topic4, topic5) {
    // FIXME: calculate gas for topics set
    this.takeGas(375 + length * 8)

    const data = this.getMemory(dataOffset, length)
    this.environment.logs.push({
      data: data,
      topics: [topic1, topic2, topic3, topic4, topic5]
    })
  }

  /**
   * Creates a new contract with a given value.
   * @param {integer} valueOffset the offset in memory to the value from
   * @param {integer} dataOffset the offset to load the code for the new contract from
   * @param {integer} length the data length
   */
  create (valueOffset, dataOffset, length) {
    this.takeGas(32000)

    const value = new U256(this.getMemory(valueOffset, constants.BALANCE_SIZE_BYTES))
    const data = this.getMemory(dataOffset, length)
    const result = this.environment.create(value, data)
    return result
  }

  /**
   * Sends a message with arbiatary data to a given address path
   * @param {integer} addressOffset the offset to load the address path from
   * @param {integer} valueOffset the offset to load the value from
   * @param {integer} dataOffset the offset to load data from
   * @param {integer} dataLength the length of data
   * @param {integer} resultOffset the offset to store the result data at
   * @param {integer} resultLength
   * @param {integer} gas
   * @return {integer} Returns 1 or 0 depending on if the VM trapped on the message or not
   */
  call (gas, addressOffset, valueOffset, dataOffset, dataLength, resultOffset, resultLength) {
    // FIXME: count properly
    this.takeGas(40)

    if (gas === undefined) {
      gas = this.gasLeft()
    }
    // Load the params from mem
    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    const value = new U256(this.getMemory(valueOffset, constants.BALANCE_SIZE_BYTES))
    const data = this.getMemory(dataOffset, dataLength)
    // Run the call
    const [result, errorCode] = this.environment.call(gas, address, value, data)
    this.setMemory(resultOffset, resultLength, result)
    return errorCode
  }

  /**
   * Message-call into this account with an alternative account’s code.
   * @param {integer} addressOffset the offset to load the address path from
   * @param {integer} valueOffset the offset to load the value from
   * @param {integer} dataOffset the offset to load data from
   * @param {integer} dataLength the length of data
   * @param {integer} resultOffset the offset to store the result data at
   * @param {integer} resultLength
   * @param {integer} gas
   * @return {integer} Returns 1 or 0 depending on if the VM trapped on the message or not
   */
  callCode (gas, addressOffset, valueOffset, dataOffset, dataLength, resultOffset, resultLength) {
    // FIXME: count properly
    this.takeGas(40)

    // Load the params from mem
    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    const value = new U256(this.getMemory(valueOffset, constants.BALANCE_SIZE_BYTES))
    const data = this.getMemory(dataOffset, dataLength)
    // Run the call
    const [result, errorCode] = this.environment.callCode(gas, address, value, data)
    this.setMemory(resultOffset, resultLength, result)
    return errorCode
  }

  /**
   * Message-call into this account with an alternative account’s code, but
   * persisting the current values for sender and value.
   * @param {integer} gas
   * @param {integer} addressOffset the offset to load the address path from
   * @param {integer} valueOffset the offset to load the value from
   * @param {integer} dataOffset the offset to load data from
   * @param {integer} dataLength the length of data
   * @param {integer} resultOffset the offset to store the result data at
   * @param {integer} resultLength
   * @return {integer} Returns 1 or 0 depending on if the VM trapped on the message or not
   */
  callDelegate (gas, addressOffset, dataOffset, dataLength, resultOffset, resultLength) {
    // FIXME: count properly
    this.takeGas(40)

    const data = this.getMemory(dataOffset, dataLength)
    const address = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    const [result, errorCode] = this.environment.callDelegate(gas, address, data)
    this.setMemory(resultOffset, resultLength, result)
    return errorCode
  }

  /**
   * store a value at a given path in long term storage which are both loaded
   * from Memory
   * @param {interger} pathOffest the memory offset to load the the path from
   * @param {interger} valueOffset the memory offset to load the value from
   */
  storageStore (pathOffset, valueOffset) {
    const path = new Buffer(this.getMemory(pathOffset, 32)).toString('hex')
    // copy the value
    const value = this.getMemory(valueOffset, 32).slice(0)
    const oldValue = this.environment.state.get(path)
    const valIsZero = value.every((i) => i === 0)

    // FIXME: gas counting has more cases then the below

    // write
    if (!valIsZero && !oldValue) {
      this.takeGas(15000)
    }

    // delete
    if (valIsZero && oldValue) {
      this.environment.gasRefund += 15000
      this.environment.state.delete(path)
    } else {
      this.environment.state.set(path, value)
    }
  }

  /**
   * reterives a value at a given path in long term storage
   * @param {interger} pathOffest the memory offset to load the the path from
   * @param {interger} resultOffset the memory offset to load the value from
   */
  storageLoad (pathOffset, resultOffset) {
    this.takeGas(50)

    const path = new Buffer(this.getMemory(pathOffset, 32)).toString('hex')
    const result = this.environment.state.get(path)
    this.setMemory(resultOffset, 32, result)
  }

  /**
   * Halt execution returning output data.
   * @param {integer} offset the offset of the output data.
   * @param {integer} length the length of the output data.
   */
  return (offset, length) {
    this.environment.returnValue = this.getMemory(offset, length)
  }

  /**
   * Halt execution and register account for later deletion giving the remaining
   * balance to an address path
   * @param {integer} offset the offset to load the address from
   */
  selfDestruct (addressOffset) {
    this.environment.suicideAddress = new Address(this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES))
    this.environment.gasRefund += 24000
  }

  getMemory (offset, length) {
    return new Uint8Array(this.module.exports.memory, offset, length)
  }

  setMemory (offset, length, value) {
    const memory = new Uint8Array(this.module.exports.memory, offset, length)
    memory.set(value)
  }

  /*
   * Takes gas from the tank. Only needs to check if there's gas left to be taken,
   * because every caller of this method is trusted.
   */
  takeGas (amount) {
    if (this.environment.gasLimit < amount) {
      throw new Error('Ran out of gas')
    }
    this.environment.gasLimit -= amount
  }
}

//
// Polyfill required unless this is sorted: https://bugs.chromium.org/p/chromium/issues/detail?id=633895
//
// Polyfill from: https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_objects/Function/bind
//
Function.prototype.bind = function (oThis) { // eslint-disable-line
  if (typeof this !== 'function') {
    // closest thing possible to the ECMAScript 5
    // internal IsCallable function
    throw new TypeError('Function.prototype.bind - what is trying to be bound is not callable')
  }

  var aArgs = Array.prototype.slice.call(arguments, 1)
  var fToBind = this
  var fNOP = function () {}
  var fBound = function () {
    return fToBind.apply(this instanceof fNOP ? this : oThis,
     aArgs.concat(Array.prototype.slice.call(arguments)))
  }

  if (this.prototype) {
    // Function.prototype doesn't have a prototype property
    fNOP.prototype = this.prototype
  }

  fBound.prototype = new fNOP() // eslint-disable-line new-cap

  return fBound
}
