
  // run tx; the tx message handler
  // runTx (tx, environment = new Environment()) {
  //   this.environment = environment

  //   if (Buffer.isBuffer(tx) || typeof tx === 'string') {
  //     tx = new Transaction(tx)
  //     if (!tx.valid) {
  //       throw new Error('Invalid transaction signature')
  //     }
  //   }

  //   // look up sender
  //   let fromAccount = this.environment.state.get(tx.from.toString())
  //   if (!fromAccount) {
  //     throw new Error('Sender account not found: ' + tx.from.toString())
  //   }

  //   if (fromAccount.get('nonce').gt(tx.nonce)) {
  //     throw new Error(`Invalid nonce: ${fromAccount.get('nonce')} > ${tx.nonce}`)
  //   }

  //   fromAccount.set('nonce', fromAccount.get('nonce').add(new U256(1)))

  //   let isCreation = false

  //   // Special case: contract deployment
  //   if (tx.to.isZero() && (tx.data.length !== 0)) {
  //     console.log('This is a contract deployment transaction')
  //     isCreation = true
  //   }

  //   // This cost will not be refunded
  //   let txCost = 21000 + (isCreation ? 32000 : 0)
  //   tx.data.forEach((item) => {
  //     if (item === 0) {
  //       txCost += 4
  //     } else {
  //       txCost += 68
  //     }
  //   })

  //   if (tx.gasLimit.lt(new U256(txCost))) {
  //     throw new Error(`Minimum transaction gas limit not met: ${txCost}`)
  //   }

  //   if (fromAccount.get('balance').lt(tx.gasLimit.mul(tx.gasPrice))) {
  //     throw new Error(`Insufficient account balance: ${fromAccount.get('balance').toString()} < ${tx.gasLimit.mul(tx.gasPrice).toString()}`)
  //   }

  //   // deduct gasLimit * gasPrice from sender
  //   fromAccount.set('balance', fromAccount.get('balance').sub(tx.gasLimit.mul(tx.gasPrice)))

  //   const handler = isCreation ? this.createHandler.bind(this) : this.callHandler.bind(this)
  //   let ret = handler({
  //     to: tx.to,
  //     from: tx.from,
  //     gasLimit: tx.gasLimit - txCost,
  //     value: tx.value,
  //     data: tx.data
  //   })

  //   // refund unused gas
  //   if (ret.executionOutcome === 1) {
  //     fromAccount.set('balance', fromAccount.get('balance').add(tx.gasPrice.mul(ret.gasLeft.add(ret.gasRefund))))
  //   }

  //   // save new state?

  //   return {
  //     executionOutcome: ret.executionOutcome,
  //     accountCreated: isCreation ? ret.accountCreated : undefined,
  //     returnValue: isCreation ? undefined : ret.returnValue,
  //     gasLeft: ret.gasLeft,
  //     logs: ret.logs
  //   }
  // }
