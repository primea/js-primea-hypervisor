const U256 = require('./deps/u256.js')

module.exports = class Message {
  constructor (opts = {}) {
    const defaults = {
      // call infromation
      to: [],
      from: [],
      data: new Uint8Array(),
      atomic: true,
      // resource info
      gas: new U256(0),
      gasPrices: new U256(0)
    }
    Object.assign(this, defaults, opts)
    this.hops = 0
    this._vistedKernels = []
    this._resultPromise = new Promise((resolve, reject) => {
      this._resolve = resolve
    })
  }

  _finish (result) {
    if (this.atomic) {
      this._vistedKernels.pop()
      if (!this._vistedKernels.length) {
        this._resolve(result)
      }
    }
  }

  result () {
    return this._resultPromise
  }

  nextPort () {
    return this.to[this.hops++]
  }

  addVistedKernel (kernel) {
    if (this.atomic) {
      this._vistedKernels.push(kernel)
    }
  }

  isCyclic (kernel) {
    return this.sync && this._vistedKernels.some(process => process === kernel)
  }
}
