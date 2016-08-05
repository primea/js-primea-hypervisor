/**
 * Debug Interface
 * This expose some functions that can help with debugging wast
 */

// This is ASCII only
function Uint8ArrayToString (input) {
  return String.fromCharCode.apply(null, input)
}

function Uint8ArrayToHexString (input) {
  var ret = ''
  for (var i = 0; i < input.length; i++) {
    ret += input[i].toString(16)
  }
  return ret
}

module.exports = class DebugInterface {
  setModule (mod) {
    this.module = mod
  }

  get exportTable () {
    return {
      'print': function (offset = 0, length = 100) {
        console.log(`<DEBUG(str): ${Uint8ArrayToString(new Uint8Array(this.module.exports.memory, offset, length))}>`)
      }.bind(this),

      'printHex': function (offset = 0, length = 100) {
        console.log(`<DEBUG(hex): ${Uint8ArrayToHexString(new Uint8Array(this.module.exports.memory, offset, length))}>`)
      }.bind(this)
    }
  }
}
