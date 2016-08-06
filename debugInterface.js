const opcodes = require('./opcodes.js')

/**
 * Debug Interface
 * This expose some functions that can help with debugging wast
 */

module.exports = class DebugInterface {
  setModule (mod) {
    this.module = mod
  }

  get exportTable () {
    return {
      'print': function (offset, length) {
        console.log(`<DEBUG(str): ${new Buffer(new Uint8Array(this.module.exports.memory, offset, length)).toString()}>`)
      }.bind(this),

      'printHex': function (offset, length) {
        console.log(`<DEBUG(hex): ${new Buffer(new Uint8Array(this.module.exports.memory, offset, length)).toString('hex')}>`)
      }.bind(this),

      'evmStackTrace': function (sp, op) {
        const opcode = opcodes(op)
        if (opcode.number) {
          opcode.name += opcode.number
        }
        console.error(opcode.name)
        console.log('-------------stack--------------')
        for (let i = sp; i > 0; i -= 32) {
          console.log(`${(sp - i) / 32} ${new Buffer(new Uint8Array(this.module.exports.memory, i - 24, 32)).toString('hex')}`)
        }
        return sp
      }.bind(this)
    }
  }
}
