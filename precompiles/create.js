  // createHandler (create) {
  //   let code = create.data

  //   // Inject metering
  //   if (Utils.isWASMCode(code)) {
  //     // FIXME: decide if these are the right values here: from: 0, gasLimit: 0, value: 0
  //     code = this.callHandler({
  //       from: Address.zero(),
  //       to: meteringContract,
  //       gasLimit: 0,
  //       value: new U256(0),
  //       data: code
  //     }).returnValue

  //     if (code[0] === 0) {
  //       code = code.slice(1)
  //     } else {
  //       throw new Error('Metering injection failed: ' + Buffer.from(code).slice(1).toString())
  //     }
  //   }

  //   let account = this.environment.state.get(create.from.toString())
  //   if (!account) {
  //     throw new Error('Account not found: ' + create.from.toString())
  //   }

  //   let address = Utils.newAccountAddress(create.from, account.get('nonce'))

  //   this.environment.addAccount(address.toString(), {
  //     balance: create.value,
  //     code: code
  //   })

  //   // Run code and take return value as contract code
  //   // FIXME: decide if these are the right values here: value: 0, data: ''
  //   code = this.messageHandler({
  //     from: create.from,
  //     to: address,
  //     gasLimit: create.gasLimit,
  //     value: new U256(0),
  //     data: new Uint8Array()
  //   }).returnValue

  //   // FIXME: special handling for selfdestruct

  //   this.environment.state.get(address.toString()).set('code', code)

  //   return {
  //     executionOutcome: 1, // success
  //     gasLeft: new U256(this.environment.gasLeft),
  //     gasRefund: new U256(this.environment.gasRefund),
  //     accountCreated: address,
  //     logs: this.environment.logs
  //   }
  // }
