const Address = require('fixed-bn.js').Address
const U256 = require('fixed-bn.js').U256
const ethUtil = require('ethereumjs-util')
const OldBlock = require('ethereumjs-block')

module.exports = class Block extends OldBlock {
  get number () {
    return ethUtil.bufferToInt(this.header.number)
  }

  get gasLimit () {
    return ethUtil.bufferToInt(this.header.gasLimit)
  }

  get difficulty () {
    return new U256(this.header.difficulty)
  }

  get timestamp () {
    return ethUtil.bufferToInt(this.header.timestamp)
  }

  get coinbase () {
    return new Address(this.header.coinbase)
  }
}
