const Environment = require('./environment.js')
const U256 = require('./u256.js')
const Address = require('./address.js')
const BN = require('bn.js')

module.exports = class TestEnvironment extends Environment {
  constructor (data) {
    super()

    if (typeof data === 'string') {
      data = JSON.parse(data)
    }

    let self = this

    if (data.accounts) {
      data.accounts.forEach((account) => {
        let tmp = account[1]
        self.state.set(new Address(account[0]).toString(), {
          balance: new U256(tmp.balance)
        })
      })
    }

    if (data.address) {
      self.address = new Address(data.address)
    }

    if (data.origin) {
      self.origin = new Address(data.origin)
    }

    if (data.caller) {
      self.caller = new Address(data.caller)
    }

    if (data.coinbase) {
      self.coinbase = new Address(data.coinbase)
    }

    if (data.callValue) {
      self.callValue = new U256(data.callValue)
    }

    if (data.callData) {
      self.callData = Uint8Array.from(new Buffer(data.callData, 'hex'))
    }

    if (data.gasPrice) {
      self.gasPrice = data.gasPrice
    }

    if (data.gasLimit) {
      self.gasLimit = data.gasLimit
    }
  }
}
