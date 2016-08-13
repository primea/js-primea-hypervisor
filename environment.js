const constants = require('./constants.js')
const U256 = require('./u256.js')

module.exports = class Environment {
  constructor (data) {
    const defaults = {
      // gas tank
      gasPrice: 0,
      gasLimit: 1000000, // The gas limit for the block
      gasRefund: 0,
      // call infromation
      address: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      origin: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      coinbase: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      difficulty: 0,
      caller: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      callValue: new U256(0),
      callData: new Uint8Array(),
      // the ROM
      code: new Uint8Array(), // the current running code
      // output calls
      logs: [],
      selfDestructAddress: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      // more output calls
      returnValue: new Uint8Array()
    }

    this.state = new Map()

    Object.assign(this, defaults, data || {})
  }

  getBalance (address) {
    return this.state.get(address.toString()).balance
  }

  getCode (address) {
    return this.state.get(address.toString()).code
  }

  getBlockHash (height) {
    // STUB
  }

  // kernal
  create (code, value) {
    // STUB
  }

  call (gas, address, value, data) {
    // STUB
    return // result
  }

  delegateCall (gas, address, data) {
    // STUB
    return // result
  }
}
