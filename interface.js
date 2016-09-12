/**
 * This is the Ethereum interface that is exposed to the WASM instance which
 * enables to interact with the Ethereum Environment
 */
const Address = require('./address.js')
const U256 = require('./u256.js')
const fs = require('fs')
const path = require('path')

const U128_SIZE_BYTES = 16
const ADDRESS_SIZE_BYTES = 20
const U256_SIZE_BYTES = 32

// The interface exposed to the WebAessembly Core
module.exports = class Interface {
  constructor (environment) {
    this.environment = environment
    const shimBin = fs.readFileSync(path.join(__dirname, '/wasm/interface.wasm'))
    const shimMod = WebAssembly.Module(shimBin)
    const shim = WebAssembly.Instance(shimMod, {
      'interface': {
        'useGas': this._useGas.bind(this)
      }
    })
    this.useGas = shim.exports.useGas
    // this.useGas = this._useGas
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
      'callDataCopy256',
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
  _useGas (high, low) {
    if (high < 0) {
      // convert from a 32-bit two's compliment
      high = 0x100000000 - high
    }

    if (low < 0) {
      // convert from a 32-bit two's compliment
      low = 0x100000000 - low
    }

    const amount = (high << 32) + low

    this.takeGas(amount)
  }

  /**
   * Returns the current amount of gas
   * @return {integer}
   */
  getGasLeft () {
    this.takeGas(2)

    return this.environment.gasLeft
  }

  /**
   * Gets address of currently executing account and loads it into memory at
   * the given offset.
   * @param {integer} offset
   */
  getAddress (offset) {
    this.takeGas(2)

    this.setMemory(offset, ADDRESS_SIZE_BYTES, this.environment.address.toMemory())
  }

  /**
   * Gets balance of the given account and loads it into memory at the given
   * offset.
   * @param {integer} addressOffset the memory offset to laod the address
   * @param {integer} resultOffset
   */
  getBalance (addressOffset, offset) {
    this.takeGas(20)

    const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
    // call the parent contract and ask for the balance of one of its child contracts
    const balance = this.environment.getBalance(address)
    this.setMemory(offset, U128_SIZE_BYTES, balance.toMemory(U128_SIZE_BYTES))
  }

  /**
   * Gets the execution's origination address and loads it into memory at the
   * given offset. This is the sender of original transaction; it is never an
   * account with non-empty associated code.
   * @param {integer} offset
   */
  getTxOrigin (offset) {
    this.takeGas(2)

    this.setMemory(offset, ADDRESS_SIZE_BYTES, this.environment.origin.toMemory())
  }

  /**
   * Gets caller address and loads it into memory at the given offset. This is
   * the address of the account that is directly responsible for this execution.
   * @param {integer} offset
   */
  getCaller (offset) {
    this.takeGas(2)

    this.setMemory(offset, ADDRESS_SIZE_BYTES, this.environment.caller.toMemory())
  }

  /**
   * Gets the deposited value by the instruction/transaction responsible for
   * this execution and loads it into memory at the given location.
   * @param {integer} offset
   */
  getCallValue (offset) {
    this.takeGas(2)

    this.setMemory(offset, U128_SIZE_BYTES, this.environment.callValue.toMemory(U128_SIZE_BYTES))
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
    this.takeGas(3 + Math.ceil(length / 32) * 3)

    if (length) {
      const callData = this.environment.callData.slice(dataOffset, dataOffset + length)
      this.setMemory(offset, length, callData)
    }
  }

  /**
   * Copys the input data in current environment to memory. This pertains to
   * the input data passed with the message call instruction or transaction.
   * @param {integer} offset the offset in memory to load into
   * @param {integer} dataOffset the offset in the input data
   */
  callDataCopy256 (offset, dataOffset) {
    this.takeGas(3)
    const callData = this.environment.callData.slice(dataOffset, dataOffset + 32)
    this.setMemory(offset, U256_SIZE_BYTES, callData)
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
    this.takeGas(3 + Math.ceil(length / 32) * 3)

    if (length) {
      const code = this.environment.code.slice(codeOffset, codeOffset + length)
      this.setMemory(resultOffset, length, code)
    }
  }

  /**
   * Get size of an account’s code.
   * @param {integer} addressOffset the offset in memory to load the address from
   * @return {integer}
   */
  getExternalCodeSize (addressOffset) {
    this.takeGas(20)

    const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
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
    this.takeGas(20 + Math.ceil(length / 32) * 3)

    if (length) {
      const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
      let code = this.environment.getCode(address)
      code = code.slice(codeOffset, codeOffset + length)
      this.setMemory(resultOffset, length, code)
    }
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

    const diff = this.environment.block.number - number
    let hash

    if (diff > 256 || diff <= 0) {
      hash = new U256(0)
    } else {
      hash = new U256(this.environment.getBlockHash(number))
    }
    this.setMemory(offset, U256_SIZE_BYTES, hash.toMemory())
  }

  /**
   * Gets the block’s beneficiary address and loads into memory.
   * @param offset
   */
  getBlockCoinbase (offset) {
    this.takeGas(2)

    this.setMemory(offset, ADDRESS_SIZE_BYTES, this.environment.block.coinbase.toMemory())
  }

  /**
   * Get the block’s timestamp.
   * @return {integer}
   */
  getBlockTimestamp () {
    this.takeGas(2)

    return this.environment.block.timestamp
  }

  /**
   * Get the block’s number.
   * @return {integer}
   */
  getBlockNumber () {
    this.takeGas(2)

    return this.environment.block.number
  }

  /**
   * Get the block’s difficulty.
   * @return {integer}
   */
  getBlockDifficulty (offset) {
    this.takeGas(2)

    this.setMemory(offset, U256_SIZE_BYTES, this.environment.block.difficulty.toMemory())
  }

  /**
   * Get the block’s gas limit.
   * @return {integer}
   */
  getBlockGasLimit () {
    this.takeGas(2)

    return this.environment.block.gasLimit
  }

  /**
   * Creates a new log in the current environment
   * @param {integer} dataOffset the offset in memory to load the memory
   * @param {integer} length the data length
   * @param {integer} number of topics
   */
  log (dataOffset, length, numberOfTopics, topic1, topic2, topic3, topic4) {
    if (numberOfTopics < 0 || numberOfTopics > 4) {
      throw new Error('Invalid numberOfTopics')
    }

    this.takeGas(375 + length * 8 + numberOfTopics * 375)

    const data = length ? this.getMemory(dataOffset, length).slice(0) : new Uint8Array([])
    const topics = []

    if (numberOfTopics > 0) {
      topics.push(U256.fromMemory(this.getMemory(topic1, U256_SIZE_BYTES)))
    }

    if (numberOfTopics > 1) {
      topics.push(U256.fromMemory(this.getMemory(topic2, U256_SIZE_BYTES)))
    }

    if (numberOfTopics > 2) {
      topics.push(U256.fromMemory(this.getMemory(topic3, U256_SIZE_BYTES)))
    }

    if (numberOfTopics > 3) {
      topics.push(U256.fromMemory(this.getMemory(topic4, U256_SIZE_BYTES)))
    }

    this.environment.logs.push({
      data: data,
      topics: topics
    })
  }

  /**
   * Creates a new contract with a given value.
   * @param {integer} valueOffset the offset in memory to the value from
   * @param {integer} dataOffset the offset to load the code for the new contract from
   * @param {integer} length the data length
   * @param (integer} resultOffset the offset to write the new contract address to
   * @return {integer} Return 1 or 0 depending on if the VM trapped on the message or not
   */
  create (valueOffset, dataOffset, length, resultOffset) {
    this.takeGas(32000 + length * 200)

    const value = U256.fromMemory(this.getMemory(valueOffset, U128_SIZE_BYTES))
    const data = this.getMemory(dataOffset, length).slice(0)
    const [errorCode, address] = this.environment.create(value, data)
    this.setMemory(resultOffset, ADDRESS_SIZE_BYTES, address.toMemory())
    return errorCode
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
    this.takeGas(40 + gas)

    // Load the params from mem
    const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
    const value = U256.fromMemory(this.getMemory(valueOffset, U128_SIZE_BYTES))
    const data = this.getMemory(dataOffset, dataLength).slice(0)

    // Special case for calling into empty account
    if (!this.environment.isAccountPresent(address)) {
      this.takeGas(25000)
    }

    // Special case for non-zero value
    if (!value.isZero()) {
      this.takeGas(9000)
      gas += 2300
    }

    const [errorCode, result] = this.environment.call(gas, address, value, data)
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
    const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
    const value = U256.fromMemory(this.getMemory(valueOffset, U128_SIZE_BYTES))
    const data = this.getMemory(dataOffset, dataLength).slice(0)
    const [errorCode, result] = this.environment.callCode(gas, address, value, data)
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

    const data = this.getMemory(dataOffset, dataLength).slice(0)
    const address = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
    const [errorCode, result] = this.environment.callDelegate(gas, address, data)
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
    const path = new Buffer(this.getMemory(pathOffset, U256_SIZE_BYTES)).toString('hex')
    // copy the value
    const value = this.getMemory(valueOffset, U256_SIZE_BYTES).slice(0)
    const oldValue = this.environment.state.get(path)
    const valIsZero = value.every((i) => i === 0)

    this.takeGas(5000)

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

    const path = new Buffer(this.getMemory(pathOffset, U256_SIZE_BYTES)).toString('hex')
    const result = this.environment.state.get(path) || new Uint8Array(32)
    this.setMemory(resultOffset, U256_SIZE_BYTES, result)
  }

  /**
   * Halt execution returning output data.
   * @param {integer} offset the offset of the output data.
   * @param {integer} length the length of the output data.
   */
  return (offset, length) {
    if (length) {
      this.environment.returnValue = this.getMemory(offset, length).slice(0)
    }
  }

  /**
   * Halt execution and register account for later deletion giving the remaining
   * balance to an address path
   * @param {integer} offset the offset to load the address from
   */
  selfDestruct (addressOffset) {
    this.environment.selfDestruct = true
    this.environment.selfDestructAddress = Address.fromMemory(this.getMemory(addressOffset, ADDRESS_SIZE_BYTES))
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
    if (this.environment.gasLeft < amount) {
      throw new Error('Ran out of gas')
    }
    this.environment.gasLeft -= amount
  }
}
