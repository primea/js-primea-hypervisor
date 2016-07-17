const Graph = require('generic-digraph')
const MAX_BAL_BYTES = require('./constants.js').MAX_BAL_BYTES

module.exports = class Environment {
  constructor (data) {
    const defaults = {
      // gas tank
      gasCounter: 0, // TODO: gasCounter is only 53 bits
      gasPrice: 0,
      gasLimit: 0, // The gas limit for the block
      // call infromation
      address: new Uint8Array(20),
      origin: new Uint8Array(20),
      coinbase: new Uint8Array(20),
      difficulty: new Uint8Array(20),
      caller: new Uint8Array(20),
      callValue: new Uint8Array(MAX_BAL_BYTES),
      callData: new ArrayBuffer(),
      // the ROM
      code: new ArrayBuffer(), // the current running code
      // output calls
      logs: [],
      suicideAddress: new ArrayBuffer(),
      // more output calls
      returnValue: new ArrayBuffer()
    }

    this.state = new Graph()

    if (data) {
      data = JSON.parse(data)
    } else {
      data = {}
    }

    Object.assign(this, defaults, data)

    if (data.accounts) {
      this.accounts = new Graph()
      const self = this
      data.accounts.forEach((account) => {
        self.accounts.set(new Uint8Array(account[0]).toString(), account[1])
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
    return this.accounts.getValue(address.toString()).balance
  }

  getCode (address) {
    // STUB
  }

  getBlockHash (height) {
    // STUB
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
