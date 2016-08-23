const ethUtils = require('ethereumjs-util')
const Address = require('./address.js')

var Utils = {}

Utils.isWASMCode = function (code) {
  return code.slice(0, 4).toString() === new Uint8Array([0, 0x61, 0x73, 0x6d]).toString()
}

Utils.newAccountAddress = function (sender, data) {
  return new Address('0x' + ethUtils.sha3(Buffer.concat([ sender.toBuffer(), Buffer.from(data) ])).slice(0, 20).toString('hex'))
}

module.exports = Utils