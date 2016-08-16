const utils = require('ethereumjs-util')

module.exports = {
  getBlock: (n) => {
    const hash = utils.sha3(new Buffer(utils.bufferToInt(n).toString()))
    const block = {
      hash: () => {
        return hash
      }
    }
    return block
  }
}
