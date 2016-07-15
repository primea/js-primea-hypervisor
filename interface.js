/**
 * This is the Ethereum interface that is exposed to the WASM instance which
 * enables to interact with the Ethereum Environment
 */
const constants = require('./constants.js')

// function.bind is not working corretly whith Wasm imports. So instead create
// a global for now. TODO REMOVE
let ENV
let MOD
// The interface exposed to the WebAessembly Core
module.exports = class Interface {

  debugPrint (a) {
    console.log(a)
  }

  memPrint () {
    console.log((new Uint8Array(MOD.exports.memory)).toString())
  }

  constructor (environment) {
    ENV = this.environment = environment
  }

  setModule (mod) {
    this.module = MOD = mod
  }

  /**
   * Subtracts an amount to the gas counter
   * @param {integer} amount the amount to subtract to the gas counter
   */
  addGas (amount) {
    if (amount > 0) {
      ENV.gasCounter += amount
    }
  }

  /**
   * Returns the current gasCounter
   * @return {integer}
   */
  gasUsed () {
    return ENV.gasCounter
  }

  /**
   * Returns the current gasCounter
   * @return {integer}
   */
  gasLeft () {
    return ENV.gas - ENV.gasCounter
  }

  /**
   * Gets address of currently executing account and loads it into memory at
   * the given offset.
   * @param {integer} offset
   */
  address (offset) {
    const address = ENV.address
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.ADD_SIZE_BYTES)
    memory.set(address)
  }

  /**
   * Gets balance of the given account and loads it into memory at the given
   * offset.
   * @param {integer} addressOffset the memory offset to laod the address
   * @param {integer} resultOffset
   */
  balance (addressOffset, offset) {
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.MAX_BAL_BYTES)
    const balance = ENV.getBalance(address)
    memory.set(balance)
  }

  /**
   * Gets the execution's origination address and loads it into memory at the
   * given offset. This is the sender of original transaction; it is never an
   * account with non-empty associated code.
   * @param {integer} offset
   */
  origin (offset) {
    const origin = ENV.origin
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.ADD_SIZE_BYTES)
    memory.set(origin)
  }

  /**
   * Gets caller address and loads it into memory at the given offset. This is
   * the address of the account that is directly responsible for this execution.
   * @param {integer} offset
   */
  caller (offset) {
    const caller = ENV.caller
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.ADD_SIZE_BYTES)
    memory.set(caller)
  }

  /**
   * Gets the deposited value by the instruction/transaction responsible for
   * this execution and loads it into memory at the given location.
   * @param {integer} offset
   */
  callValue (offset) {
    const callValue = ENV.callValue
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.MAX_BAL_BYTES)
    memory.set(callValue)
  }

  /**
   * Get size of input data in current environment. This pertains to the input
   * data passed with the message call instruction or transaction.
   * @return {integer}
   */
  callDataSize () {
    return ENV.callData.byteLength
  }

  /**
   * Copys the input data in current environment to memory. This pertains to
   * the input data passed with the message call instruction or transaction.
   * @param {integer} offset the offset in memory to load into
   * @param {integer} dataOffset the offset in the input data
   * @param {integer} length the length of data to copy
   */
  callDataCopy (offset, dataOffset, length) {
    const callData = new Uint8Array(ENV.callData, offset, length)
    const memory = new Uint8Array(MOD.exports.memory, offset, length)
    memory.set(callData)
  }

  /**
   * Gets the size of code running in current environment.
   * @return {interger}
   */
  codeSize () {
    return ENV.code.byteLength
  }

  /**
   * Copys the code running in current environment to memory.
   * @param {integer} offset the memory offset
   * @param {integer} codeOffset the code offset
   * @param {integer} length the length of code to copy
   */
  codeCopy (offset, codeOffset, length) {
    const code = new Uint8Array(ENV.code, codeOffset, length)
    const memory = new Uint8Array(MOD.exports.memory, offset, length)
    memory.set(code)
  }

  /**
   * Get size of an account’s code.
   * @param {integer} addressOffset the offset in memory to load the address from
   * @return {integer}
   */
  extCodeSize (addressOffset) {
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
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
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
    let code = this.environment.getCode(address)
    code = new Uint8Array(code, codeOffset, length)
    const memory = new Uint8Array(MOD.exports.memory, offset, length)
    memory.set(code)
  }

  /**
   * Gets price of gas in current environment.
   * @return {integer}
   */
  gasPrice () {
    return ENV.gasPrice
  }

  /**
   * Gets the hash of one of the 256 most recent complete blocks.
   * @param {integer} number which block to load
   * @param {integer} offset the offset to load the hash into
   */
  blockHash (number, offset) {
    const hash = this.environment.getBlockHash(number)
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.ADD_SIZE_BYTES)
    memory.set(hash)
  }

  /**
   * Gets the block’s beneficiary address and loads into memory.
   * @param offset
   */
  coinbase (offset) {
    const memory = new Uint8Array(MOD.exports.memory, offset, constants.ADD_SIZE_BYTES)
    memory.set(ENV.coinbase)
  }

  /**
   * Get the block’s timestamp.
   * @return {integer}
   */
  timestamp () {
    return ENV.timestamp
  }

  /**
   * Get the block’s number.
   * @return {integer}
   */
  number () {
    return ENV.number
  }

  /**
   * Get the block’s difficulty.
   * @return {integer}
   */
  difficulty () {
    return ENV.difficulty
  }

  /**
   * Get the block’s gas limit.
   * @return {integer}
   */
  gasLimit () {
    return ENV.gasLimit
  }

  /**
   * Creates a new log in the current environment
   * @param {integer} dataOffset the offset in memory to load the memory
   * @param {integer} length the data length
   * TODO: replace with variadic
   */
  log (dataOffset, length, topic1, topic2, topic3, topic4, topic5) {
    const data = new Uint8Array(MOD.exports.memory, dataOffset, length)
    ENV.logs.push({
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
    const value = new Uint8Array(MOD.exports.memory, valueOffset, constants.MAX_BAL_BYTES)
    const data = new Uint8Array(MOD.exports.memory, dataOffset, length)
    const result = ENV.create(value, data)
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
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
    const value = new Uint8Array(MOD.exports.memory, valueOffset, constants.MAX_BAL_BYTES)
    const data = new Uint8Array(MOD.exports.memory, dataOffset, dataLength)
    // Run the call
    const [result, errorCode] = ENV.call(gas, address, value, data)
    const memory = new Uint8Array(MOD.exports.memory, resultOffset, resultLength)
    memory.set(result)

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
    const data = new Uint8Array(MOD.exports.memory, dataOffset, dataLength)
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
    const [result, errorCode] = this.environment.callDelegate(gas, address, data)
    const memory = new Uint8Array(MOD.exports.memory, resultOffset, resultLength)
    memory.set(result)

    return errorCode
  }

  /**
   * store a value at a given path in long term storage which are both loaded
   * from Memory
   * @param {interger} pathOffest the memory offset to load the the path from
   * @param {interger} valueOffset the memory offset to load the value from
   */
  sstore (pathOffest, valueOffset) {
    const path = new Uint8Array(MOD.exports.memory, pathOffest, pathOffest + 32)
    const value = new Uint8Array(MOD.exports.memory, valueOffset, valueOffset + 32)
    ENV.state.set(path, value)
  }

  /**
   * reterives a value at a given path in long term storage
   * @param {interger} pathOffest the memory offset to load the the path from
   * @param {interger} resultOffset the memory offset to load the value from
   */
  sload (pathOffest, resultOffset) {
    const path = new Uint8Array(MOD.exports.memory, pathOffest, pathOffest + 32)
    const result = ENV.state.getValue(path)
    const memory = new Uint8Array(MOD.exports.memory, resultOffset, resultOffset + 32)
    memory.set(result)
  }

  /**
   * Halt execution returning output data.
   * @param {integer} offset the offset of the output data.
   * @param {integer} length the length of the output data.
   */
  return (offset, length) {
    this.environment.returnValue = new Uint8Array(MOD.exports.memory, offset, length)
  }

  /**
   * Halt execution and register account for later deletion giving the remaining
   * balance to an address path
   * @param {integer} offset the offset to load the address from
   */
  suicide (addressOffset) {
    const address = new Uint8Array(MOD.exports.memory, addressOffset, constants.ADD_SIZE_BYTES)
    this.environment.suicideAddress = address
  }
}
