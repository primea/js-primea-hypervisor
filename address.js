const ethUtils = require('ethereumjs-util')

module.exports = class Address extends Uint8Array {
  constructor (value) {
    super(value)
    // Special case: duplicate
    if (value instanceof Address) {
      this._value = new Buffer(value._value)
      return
    }

    if (value instanceof Uint8Array) {
      this._value = new Buffer(value)
    } else if (typeof value !== 'string') {
      throw new Error('Invalid input to address')
    } else if (!ethUtils.isHexPrefixed(value)) {
      throw new Error('Invalid address format')
    } else {
      this._value = new Buffer(ethUtils.stripHexPrefix(value), 'hex')
    }

    if (this._value.length !== 20) {
      throw new Error('Invalid address length')
    }
  }

  toBuffer () {
    return this._value
  }

  toString () {
    return '0x' + this._value.toString('hex')
  }

  isZero () {
    return this._value.equals(ethUtils.zeros(20))
  }
}
