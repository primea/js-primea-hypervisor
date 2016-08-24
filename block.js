//
// This class parses a serialised Ethereum Block
//
// The input is a Buffer.
//
const Address = require('./address.js')
const ethUtil = require('ethereumjs-util')
const OldBlock = require('ethereumjs-block')
const U256 = require('./u256.js')

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
    return new Address('0x' + this.header.coinbase.toString('hex'))
  }
}
