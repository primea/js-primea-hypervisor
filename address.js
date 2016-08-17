const ethUtil = require('ethereumjs-util')

module.exports = class Address extends Buffer {
  constructor (value) {
    if (value instanceof Address || value instanceof Uint8Array) {
      super(value)
    } else if (typeof value !== 'string') {
      throw new Error('Invalid input to address')
    } else if (!ethUtil.isHexPrefixed(value)) {
      throw new Error('Invalid address format')
    } else {
      super(ethUtil.stripHexPrefix(value), 'hex')
    }

    if (this.length !== 20) {
      throw new Error('Invalid address length')
    }
  }

  toString () {
    return '0x' + this.toString('hex')
  }

  isZero () {
    return this.every((el) => el === 0)
  }

  equals (address) {
    return this._value.toString('hex') === address.toBuffer().toString('hex')
  }
}
