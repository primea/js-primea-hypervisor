//
// This class parses a serialised Ethereum transaction
//
// The input is a Buffer.
//
const Address = require('./address.js')
const U256 = require('./u256.js')
const OldTx = require('ethereumjs-tx')

module.exports = class Transaction {
  constructor (tx) {
    this._tx = new OldTx(tx)
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
    return Uint8Array.from(this._tx.data)
  }

  get from () {
    return new Address('0x' + this._tx.getSenderAddress().toString('hex'))
  }

  get to () {
    if (this._tx.to.length === 0) {
      return new Address('0x0000000000000000000000000000000000000000')
    }
    return new Address('0x' + this._tx.to.toString('hex'))
  }

  get isSend () {
  }

  get isContractCall () {
  }

  get isContractDeployment () {
  }
}
