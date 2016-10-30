const ethUtil = require('ethereumjs-util')
const Address = require('./address.js')

var Utils = {}

Utils.isWASMCode = function (code) {
  return code.slice(0, 4).toString() === new Uint8Array([0, 0x61, 0x73, 0x6d]).toString()
}

Utils.newAccountAddress = function (sender, nonce) {
  return new Address('0x' + ethUtil.generateAddress(sender.toString(), nonce.toString()).toString('hex'))
}

module.exports = Utils
