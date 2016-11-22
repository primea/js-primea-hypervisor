// run block; the block message handler:w
const Environment = require('./environment')

module.exports = class runBlock {
  constuctor (block, environment = new Environment()) {
    // verify block then run each tx
    block.tx.forEach((tx) => {
      this.runTx(tx, environment)
    })
  }
}
