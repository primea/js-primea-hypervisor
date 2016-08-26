const Environment = require('./environment.js')
const U256 = require('./u256.js')
const Address = require('./address.js')
const Block = require('./block.js')
const ethUtil = require('ethereumjs-util')

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
        self.state.set(new Address(account[0]).toString(), new Map(
          [['balance', new U256(tmp.balance)]]
        ))
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

    if (data.block) {
      let block = {}

      if (data.block.blockNumber) {
        block.number = ethUtil.toBuffer(data.block.blockNumber)
      }

      if (data.block.gasLimit) {
        block.gasLimit = ethUtil.toBuffer(data.block.gasLimit)
      }

      if (data.block.difficulty) {
        block.difficulty = ethUtil.toBuffer(data.block.difficulty)
      }

      if (data.block.timestamp) {
        block.timestamp = ethUtil.toBuffer(data.block.timestam)
      }

      if (data.block.coinbase) {
        block.coinbase = ethUtil.toBuffer(data.block.coinbase)
      }

      if (Object.keys(block).length > 0) {
        self.block = new Block({ header: block, transactions: [], uncleHeaders: [] })
      }
    }
  }
}
