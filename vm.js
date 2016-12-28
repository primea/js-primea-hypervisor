module.exports = class VM {
  /**
   * The interface API is the api the exposed to interfaces. All queries about
   * the enviroment and call to the kernel go through this API
   */
  constructor (code) {
    this._module = WebAssembly.Module(code)
  }

  /**
   * Runs the core VM with a given environment and imports
   */
  run (environment, imports) {
    this._environment = environment
    // TODO, delete the instance once done.
    const instance = this._instance = WebAssembly.Instance(this._module, imports)
    if (instance.exports.main) {
      instance.exports.main()
    }
    return this.onDone()
  }

  /**
   * returns a promise that resolves when the wasm instance is done running
   */
  async onDone () {
    let prevOps
    while (prevOps !== this._opsQueue) {
      prevOps = this._opsQueue
      await this._opsQueue
    }
  }

  /**
   * addes an aync operation to the operations queue
   */
  pushOpsQueue (promise, callbackIndex, intefaceCallback) {
    this._opsQueue = Promise.all([this._opsQueue, promise]).then(values => {
      const result = intefaceCallback(values.pop())
      this._instance.exports[callbackIndex.toString()](result)
    })
  }

  sendMessage (message) {

  }

  get environment () {
    return this._environment
  }

  get memory () {
    return this._instance.exports.memory.buffer
  }
}
