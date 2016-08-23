const Environment = require('./environment.js')
const U256 = require('./u256.js')
const Address = require('./address.js')
const Block = require('./block.js')

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

    if (data.callValue) {
      self.callValue = new U256(data.callValue)
    }

    if (data.callData) {
      self.callData = Uint8Array.from(new Buffer(data.callData, 'hex'))
    }

    if (data.gasPrice) {
      self.gasPrice = data.gasPrice
    }

    if (data.gasLeft) {
      self.gasLeft = data.gasLeft
    }

    let block = {}

    if (data.blockNumber) {
      block.number = data.blockNumber
    }

    if (data.gasLimit) {
      block.gasLimit = data.gasLimit
    }

    if (data.difficulty) {
      block.difficulty = adta.difficulty
    }

    if (data.timestamp) {
      block.timestamp = data.timestamp
    }

    if (data.coinbase) {
      block.coinbase = data.coinbase
    }

    if (Object.keys(block).length > 0) {
      self.block = new Block({ header: block, transactions: [], uncleHeaders: [] })
    }
  }
}
