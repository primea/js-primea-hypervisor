const U256 = require('./u256.js')
const Block = require('ethereumjs-block')
const constants = require('./constants.js')
const blockChain = require('./fakeBlockChain.js')

module.exports = class Environment {
  constructor (data) {
    const defaults = {
      block: new Block(),
      // gas tank
      gasPrice: 0,
      gasLimit: 1000000, // The gas limit for the block
      gasRefund: 0,
      // call infromation
      address: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      origin: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      coinbase: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      difficulty: 0,
      caller: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      callValue: new U256(0),
      callData: new Uint8Array(),
      // the ROM
      code: new Uint8Array(), // the current running code
      // output calls
      logs: [],
      selfDestructAddress: new Uint8Array(constants.ADDRESS_SIZE_BYTES),
      // more output calls
      returnValue: new Uint8Array()
    }

    const self = this
    this.state = new Map()

    if (data) {
      data = JSON.parse(data)
    } else {
      data = {}
    }

    Object.assign(this, defaults, data)
    if (data.accounts) {
      data.accounts.forEach((account) => {
        self.state.set(new Uint8Array(account[0]).toString(), account[1])
      })
    }

    if (data.address) {
      this.address = new Uint8Array(data.address)
    }

    if (data.origin) {
      this.origin = new Uint8Array(data.origin)
    }

    if (data.caller) {
      this.caller = new Uint8Array(data.caller)
    }

    if (data.callValue) {
      this.callValue = new Uint8Array(data.callValue)
    }

    if (data.callData) {
      this.callData = hexStr2arrayBuf(data.callData)
    }
  }

  getBalance (address) {
    return this.state.get(address.toString()).balance
  }

  getCode (address) {
    // STUB
  }

  getBlockHash (height) {
    return blockChain.getBlock(height).hash()
  }

  // kernal
  create (code, value) {
    // STUB
  }

  call (gas, address, value, data) {
    // STUB
    return // result
  }

  delegateCall (gas, address, data) {
    // STUB
    return // result
  }
}

function hexStr2arrayBuf (string) {
  const ab = new ArrayBuffer(string.length / 2)
  const view = new Uint8Array(ab)
  string = [...string]
  let temp = ''
  string.forEach((el, i) => {
    temp += el
    if (i % 2) {
      view[(i + 1) / 2 - 1] = parseInt(temp, 16)
      temp = ''
    }
  })
  return ab
}
