/**
 * Debug Interface
 * This expose some functions that can help with debugging wast
 */
const Interface = require('./interface.js')
let MOD

module.exports = class DebugInterface extends Interface {
  debugPrint (a, b) {
    console.log(a)
  }

  memPrint () {
    console.log((new Uint8Array(MOD.exports.memory)).toString())
  }
}
