var Utils = {}

Utils.isWASMCode = function (code) {
  return code.slice(0, 4).toString() === new Uint8Array([0, 0x61, 0x73, 0x6d]).toString()
}

module.exports = Utils