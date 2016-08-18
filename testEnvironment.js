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
          balance: new U256(new BN(tmp.balance, 16, 'le'))
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
      self.callData = hexStr2arrayBuf(data.callData)
    }

    if (data.gasPrice) {
      self.gasPrice = data.gasPrice
    }

    if (data.gasLimit) {
      self.gasLimit = data.gasLimit
    }
  }
}

function hexStr2arrayBuf (string) {
  const view = new Uint8Array(string.length / 2)
  string = [...string]
  let temp = ''
  string.forEach((el, i) => {
    temp += el
    if (i % 2) {
      view[(i + 1) / 2 - 1] = parseInt(temp, 16)
      temp = ''
    }
  })
  return view
}
