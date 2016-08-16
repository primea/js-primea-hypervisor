const constants = require('./constants.js')
const U256 = require('./u256.js')
const Address = require('./address.js')

module.exports = class Environment {
  constructor (data) {
    const defaults = {
      // gas tank
      gasPrice: 0,
      gasLimit: 1000000, // The gas limit for the block
      gasRefund: 0,
      // call infromation
      address: new Address('0x0000000000000000000000000000000000000000'),
      origin: new Address('0x0000000000000000000000000000000000000000'),
      coinbase: new Address('0x0000000000000000000000000000000000000000'),
      difficulty: 0,
      caller: new Address('0x0000000000000000000000000000000000000000'),
      callValue: new U256(0),
      callData: new Uint8Array(),
      // the ROM
      code: new Uint8Array(), // the current running code
      // output calls
      logs: [],
      selfDestructAddress: new Address('0x0000000000000000000000000000000000000000'),
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
    // STUB
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
