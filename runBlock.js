  // run block; the block message handler
  runBlock(block, environment = new Environment()) {
    // verify block then run each tx
    block.tx.forEach((tx) => {
      this.runTx(tx, environment)
    })
  }

  // run blockchain
  // runBlockchain () {}
