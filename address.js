const U256 = require('./u256.js')

module.exports = class Address extends U256 {
  constructor (value) {
    super(value)
    if (this._value.byteLength() > 20) {
      throw new Error('Invalid address length: ' + this._value.byteLength() + ' for ' + value)
    }
  }

  toBuffer () {
    return super.toBuffer(20)
  }

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
