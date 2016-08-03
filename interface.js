/**
 * This is the Ethereum interface that is exposed to the WASM instance which
 * enables to interact with the Ethereum Environment
 */
const constants = require('./constants.js')

// The interface exposed to the WebAessembly Core
module.exports = class Interface {
  constructor (environment) {
    this.environment = environment
  }

  get exportTable () {
    let exportMethods = [
      // include all the public methods according to the Ethereum Environment Interface (EEI)
      // FIXME: this currently doesn't match EEI r0
      'useGas',
      'gas',
      'address',
      'balance',
      'origin',
      'caller',
      'callValue',
      'callDataSize',
      'callDataCopy',
      'codeSize',
      'codeCopy',
      'extCodeSize',
      'extCodeCopy',
      'gasPrice',
      'blockHash',
      'coinbase',
      'timestamp',
      'number',
      'difficulty',
      'gasLimit',
      'log',
      'create',
      'call',
      'callDelegate',
      'sstore',
      'sload',
      'return',
      'suicide'
    ]
    let ret = {}
    exportMethods.forEach((method) => {
      ret[method] = this[method].bind(this)
    })
    return ret
  }

  // FIXME: this shouldn't be needed
  get env () {
    return this.environment
  }

  setModule (mod) {
    this.module = mod
  }

  /**
   * Subtracts an amount to the gas counter
   * @param {integer} amount the amount to subtract to the gas counter
   */
  useGas (amount) {
    if (amount > 0) {
      this.environment.gasLimit -= amount
    }
  }

  /**
   * Returns the current amount of gas
   * @return {integer}
   */
  gas () {
    return this.environment.gasLimit
  }

  /**
   * Gets address of currently executing account and loads it into memory at
   * the given offset.
   * @param {integer} offset
   */
  address (offset) {
    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.address)
  }

  /**
   * Gets balance of the given account and loads it into memory at the given
   * offset.
   * @param {integer} addressOffset the memory offset to laod the address
   * @param {integer} resultOffset
   */
  balance (addressOffset, offset) {
    const address = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
    // call the parent contract and ask for the balance of one of its child contracts
    const balance = this.environment.parent.environment.getBalance(address)
    this.setMemory(offset, constants.BALANCE_SIZE_BYTES, balance)
  }

  /**
   * Gets the execution's origination address and loads it into memory at the
   * given offset. This is the sender of original transaction; it is never an
   * account with non-empty associated code.
   * @param {integer} offset
   */
  origin (offset) {
    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.origin)
  }

  /**
   * Gets caller address and loads it into memory at the given offset. This is
   * the address of the account that is directly responsible for this execution.
   * @param {integer} offset
   */
  caller (offset) {
    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.caller)
  }

  /**
   * Gets the deposited value by the instruction/transaction responsible for
   * this execution and loads it into memory at the given location.
   * @param {integer} offset
   */
  callValue (offset) {
    this.setMemory(offset, constants.BALANCE_SIZE_BYTES, this.environment.callValue)
  }

  /**
   * Get size of input data in current environment. This pertains to the input
   * data passed with the message call instruction or transaction.
   * @return {integer}
   */
  callDataSize () {
    return this.environment.callData.byteLength
  }

  /**
   * Copys the input data in current environment to memory. This pertains to
   * the input data passed with the message call instruction or transaction.
   * @param {integer} offset the offset in memory to load into
   * @param {integer} dataOffset the offset in the input data
   * @param {integer} length the length of data to copy
   */
  callDataCopy (offset, dataOffset, length) {
    const callData = new Uint8Array(this.environment.callData, offset, length)
    this.setMemory(offset, length, callData)
  }

  /**
   * Gets the size of code running in current environment.
   * @return {interger}
   */
  codeSize () {
    return this.environment.code.byteLength
  }

  /**
   * Copys the code running in current environment to memory.
   * @param {integer} offset the memory offset
   * @param {integer} codeOffset the code offset
   * @param {integer} length the length of code to copy
   */
  codeCopy (offset, codeOffset, length) {
    const code = new Uint8Array(this.environment.code, codeOffset, length)
    this.setMemory(offset, length, code)
  }

  /**
   * Get size of an account’s code.
   * @param {integer} addressOffset the offset in memory to load the address from
   * @return {integer}
   */
  extCodeSize (addressOffset) {
    const address = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
    const code = this.environment.getCode(address)
    return code.byteLength
  }

  /**
   * Copys the code of an account to memory.
   * @param {integer} addressOffset the memory offset of the address
   * @param {integer} offset the memory offset
   * @param {integer} codeOffset the code offset
   * @param {integer} length the length of code to copy
   */
  extCodeCopy (addressOffset, offset, codeOffset, length) {
    const address = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
    let code = this.environment.getCode(address)
    code = new Uint8Array(code, codeOffset, length)
    this.setMemory(offset, length, code)
  }

  /**
   * Gets price of gas in current environment.
   * @return {integer}
   */
  gasPrice () {
    return this.environment.gasPrice
  }

  /**
   * Gets the hash of one of the 256 most recent complete blocks.
   * @param {integer} number which block to load
   * @param {integer} offset the offset to load the hash into
   */
  blockHash (number, offset) {
    const hash = this.environment.getBlockHash(number)
    this.setMemory(offset, 32, hash)
  }

  /**
   * Gets the block’s beneficiary address and loads into memory.
   * @param offset
   */
  coinbase (offset) {
    this.setMemory(offset, constants.ADDRESS_SIZE_BYTES, this.environment.coinbase)
  }

  /**
   * Get the block’s timestamp.
   * @return {integer}
   */
  timestamp () {
    return this.environment.timestamp
  }

  /**
   * Get the block’s number.
   * @return {integer}
   */
  number () {
    return this.environment.number
  }

  /**
   * Get the block’s difficulty.
   * @return {integer}
   */
  difficulty () {
    return this.environment.difficulty
  }

  /**
   * Get the block’s gas limit.
   * @return {integer}
   */
  gasLimit () {
    return this.environment.gasLimit
  }

  /**
   * Creates a new log in the current environment
   * @param {integer} dataOffset the offset in memory to load the memory
   * @param {integer} length the data length
   * TODO: replace with variadic
   */
  log (dataOffset, length, topic1, topic2, topic3, topic4, topic5) {
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
    const value = this.getMemory(valueOffset, constants.BALANCE_SIZE_BYTES)
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
   * TODO: add proper gas counting
   */
  call (addressOffset, valueOffset, dataOffset, dataLength, resultOffset, resultLength, gas) {
    if (gas === undefined) {
      gas = this.gasLeft()
    }
    // Load the params from mem
    const address = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
    const value = this.getMemory(valueOffset, constants.BALANCE_SIZE_BYTES)
    const data = this.getMemory(dataOffset, dataLength)
    // Run the call
    const [result, errorCode] = this.environment.call(gas, address, value, data)
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
    const data = this.getMemory(dataOffset, dataLength)
    const address = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
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
  sstore (pathOffset, valueOffset) {
    const path = this.getMemory(pathOffset, 32).toString('hex')
    const value = this.getMemory(valueOffset, 32)
    const oldValue = this.environment.state.get(path)
    const valIsZero = value.every((i) => i === 0)

    // write
    if (!valIsZero && !oldValue) {
      this.environment.gasLimit -= 15000
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
  sload (pathOffset, resultOffset) {
    const path = this.getMemory(pathOffset, 32).toString('hex')
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
  suicide (addressOffset) {
    this.environment.suicideAddress = this.getMemory(addressOffset, constants.ADDRESS_SIZE_BYTES)
  }

  getMemory (offset, length) {
    return new Uint8Array(this.module.exports.memory, offset, length)
  }

  setMemory (offset, length, value) {
    const memory = new Uint8Array(this.module.exports.memory, offset, length)
    memory.set(value)
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
