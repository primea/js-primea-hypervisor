module.exports = class KernelInterface {
  constructor (kernel, environment) {
    this._kernel = kernel
    this._environment = environment
  }

  run (code) {
    const imports = this._kernel.interfaces.reduce((obj, Interface) => {
      obj[Interface.name] = new Interface(this).exports
      return obj
    }, {})

    const module = WebAssembly.Module(code)
    const instance = this._instance = WebAssembly.Instance(module, imports)

    if (instance.exports.main) {
      instance.exports.main()
    }
    return this.onDone()
  }

  // returns a promise that resolves when the wasm instance is done running
  async onDone () {
    let prevOps
    while (prevOps !== this._opsQueue) {
      prevOps = this._opsQueue
      await this._opsQueue
    }
  }

  pushOpsQueue (promise, callbackIndex, intefaceCallback) {
    this._opsQueue = Promise.all([this._opsQueue, promise]).then(values => {
      intefaceCallback(values.pop())
      this._instance.exports[callbackIndex.toString()]()
    })
  }

  sendMessage (message) {

  }

  get environment () {
    return this._environment
  }

  get memory () {
    return this._instance.exports.memory
  }

}
