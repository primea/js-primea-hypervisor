const utils = require('ethereumjs-util')
const U256 = require('fixed-bn.js').U256

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
