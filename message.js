const U256 = require('./deps/u256.js')
const Address = require('./deps/address.js')

module.exports = class Message {
  constructor (opts = {}) {
    const defaults = {
      // call infromation
      to: [],
      origin: new Address('0x0000000000000000000000000000000000000000'),
      from: [],
      data: new Uint8Array(),
      sync: true,
      // resource info
      gas: new U256(0),
      gasPrices: new U256(0)
    }
    Object.assign(this, defaults, opts)
    this._index = 0
    this._parentProcesses = []
  }

  nextPort () {
    // this.from.push(message.toPort)
    this.toPort = this.to[this._index]
    this._index++
    return this.toPort
  }

  finished () {
    if (this.sync) {
      this._parentProcesses.pop()
    }
  }

  sending (kernel, parentMessage) {
    if (this.sync && parentMessage) {
      this._parentProcesses = parentMessage._parentProcesses
      this._parentProcesses.push(kernel)
    }
  }

  isCyclic (kernel) {
    return this.sync && this._parentProcesses.some(process => process === kernel)
  }
}
