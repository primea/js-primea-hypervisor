const U128 = require('fixed-bn.js').U128

module.exports = class Message {
  constructor (opts = {}) {
    const defaults = {
      // call infromation
      to: [],
      from: [],
      data: new Uint8Array(),
      atomic: true,
      // resource info
      gas: new U128(0),
      gasPrices: new U128(0)
    }
    Object.assign(this, defaults, opts)
    this.hops = 0
    this._visitedKernels = []
    this._resultPromise = new Promise((resolve, reject) => {
      this._resolve = resolve
    })
  }

  result () {
    return this._resultPromise
  }

  nextPort () {
    return this.to[this.hops]
  }

  _respond (result) {
    this._resolve(result)
  }

  _finish () {
    this._visitedKernels.pop()
  }

  _visited (kernel, currentMessage) {
    if (currentMessage && this !== currentMessage) {
      this._visitedKernels = currentMessage._visitedKernels
    }
    this._visitedKernels.push(kernel)
  }

  _isCyclic (kernel) {
    return this.atomic && this._visitedKernels.some(process => process === kernel)
  }
}
