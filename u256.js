const BN = require('bn.js')
const ethUtil = require('ethereumjs-util')

module.exports = class U256 {
  constructor (value) {
    // This is the case when data is copied from WASM
    if (value instanceof Uint8Array) {
      this._value = new BN(value, 16, 'le')
    } else if ((typeof value === 'string') && ethUtil.isHexPrefixed(value)) {
      this._value = new BN(ethUtil.stripHexPrefix(value), 16)
    } else {
      this._value = new BN(value, 10)
    }
  }

  toString (radix = 10) {
    if (radix === 16) {
      return '0x' + this._value.toString(16)
    }
    return this._value.toString(radix)
  }

  toBuffer (width) {
    if (width <= 0 || width > 32) {
      throw new Error('Invalid U256 width')
    }
    return this._value.toBuffer('le', width || 32)
  }

  sub (u256) {
    return new U256(this._value.sub(u256._value))
  }

  add (u256) {
    return new U256(this._value.add(u256._value))
  }

  mul (u256) {
    return new U256(this._value.mul(u256._value))
  }

  div (u256) {
    return new U256(this._value.div(u256._value))
  }

  lt (u256) {
    return this._value.lt(u256._value)
  }

  gt (u256) {
    return this._value.gt(u256._value)
  }
}
