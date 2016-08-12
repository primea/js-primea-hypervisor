const ethUtils = require('ethereumjs-util')

module.exports = class Address {
  constructor (value) {
    if (typeof value !== 'string') {
      throw new Error('Invalid input to address')
    }

    if (!ethUtils.isHexPrefixed(value)) {
      throw new Error('Invalid address format')
    }

    this._value = new Buffer(ethUtils.stripHexPrefix(value), 'hex')

    if (this._value.length !== 20) {
      throw new Error('Invalid address length')
    }
  }

  toString () {
    return '0x' + this._value.toString('hex')
  }
}
