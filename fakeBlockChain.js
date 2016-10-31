const utils = require('ethereumjs-util')
const U256 = require('./deps/u256.js')

module.exports = {
  getBlock: (n) => {
    const hash = utils.sha3(new Buffer(utils.bufferToInt(n).toString()))
    const block = {
      hash: () => {
        return new U256(hash)
      }
    }
    return block
  }
}
