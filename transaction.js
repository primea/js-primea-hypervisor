//
// This class parses a serialised Ethereum transaction
//
// The input is a Buffer.
//

const Address = require('./address.js')
const U256 = require('./u256.js')
const ethUtils = require('ethereumjs-util')
const ethTx = require('ethereumjs-tx')

module.exports = class Transaction {
  constructor (tx) {
    this._tx = new ethTx(tx)
  }

  get valid () {
    return this._tx.verifySignature()
  }

  get nonce () {
    return new U256(this._tx.nonce)
  }

  get gasPrice () {
    return new U256(this._tx.gasPrice)
  }

  get gasLimit () {
    return new U256(this._tx.gasLimit)
  }

  get value () {
    return new U256(this._tx.value)
  }

  get data () {
    return this._tx.data
  }

  get from () {
    return new Address(this._tx.getSenderAddress())
  }

  get to () {
    if (this._tx.to.length === 0) {
      return new Address('0x0000000000000000000000000000000000000000')
    }
    return new Address(this._tx.to)
  }

  get isSend () {
  }

  get isContractCall () {
  }

  get isContractDeployment () {
  }
}
