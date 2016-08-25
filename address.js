const BN = require('bn.js')
const U256 = require('./u256.js')

module.exports = class Address extends U256 {
  constructor (value) {
    super(value)
    if (this._value.byteLength() > 20) {
      throw new Error('Invalid address length: ' + this._value.byteLength() + ' for ' + value)
    }
  }

  // This assumes Uint8Array in LSB (WASM code)
  static fromMemory (value) {
    return new Address(new BN(value, 16, 'le'))
  }

  // This assumes Uint8Array in LSB (WASM code)
  toMemory () {
    return this._value.toBuffer('le', 20)
  }

  toBuffer () {
    return super.toBuffer(20)
  }

  // Needs to be displayed as a hex always
  toString () {
    return '0x' + this._value.toString('hex', 40)
  }

  isZero () {
    return this._value.isZero()
  }

  equals (address) {
    return this.toString() === address.toString()
  }
}
