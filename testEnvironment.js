const Environment = require('./environment.js')
const fakeBlockchain = require('./fakeBlockChain')

module.exports = class TestEnvironment extends Environment {
  async getBlockHash (height) {
    return fakeBlockchain.getBlock(height).hash()
  }
}
