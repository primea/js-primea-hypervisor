const opcodes = require('./opcodes.js')

/**
 * Debug Interface
 * This expose some functions that can help with debugging wast
 */

// This is ASCII only
function Uint8ArrayToString (input) {
  return String.fromCharCode.apply(null, input)
}

function Uint8ArrayToHexString (input) {
  return new Buffer(input).toString('hex')
}

module.exports = class DebugInterface {
  setModule (mod) {
    this.module = mod
  }

  get exportTable () {
    return {
      'print': function (offset, length) {
        console.log(`<DEBUG(str): ${Uint8ArrayToString(new Uint8Array(this.module.exports.memory, offset, length))}>`)
      }.bind(this),

      'printHex': function (offset, length) {
        console.log(`<DEBUG(hex): ${Uint8ArrayToHexString(new Uint8Array(this.module.exports.memory, offset, length))}>`)
      }.bind(this),

      'evmStackTrace': function (sp, op) {
        const opcode = opcodes(op)
        if (opcode.number) {
          opcode.name += opcode.number
        }
        console.error(opcode.name)
        console.log('-------------stack--------------')
        for (let i = sp; i > 0; i -= 32) {
          console.log(`${(sp - i) / 32} ${Uint8ArrayToHexString(new Uint8Array(this.module.exports.memory, i - 24, 32))}`)
        }
        return sp
      }.bind(this)
    }
  }
}
