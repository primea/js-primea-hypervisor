module.exports = class Wasm {
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
  async run (message, kernel, imports) {
    const responses = {}
    /**
     * Builds a import map with an array of given interfaces
     */
    function buildImports (kernelApi, kernel, imports) {
      const importMap = {}
      for (const Import of imports) {
        const response = responses[Import.name] = {}
        const newInterface = new Import(kernelApi, message, response)
        importMap[Import.name] = newInterface.exports
      }
      return importMap
    }

    let instance
    const interfaceApi = {
      /**
       * adds an aync operation to the operations queue
       */
      pushOpsQueue: (promise, callbackIndex, intefaceCallback) => {
        this._opsQueue = Promise.all([this._opsQueue, promise]).then(values => {
          const result = intefaceCallback(values.pop())
          instance.exports.callback.get(callbackIndex)(result)
        })
      },
      memory: () => {
        return instance.exports.memory.buffer
      },
      kernel: kernel
    }

    const initializedImports = buildImports(interfaceApi, kernel, imports)
    instance = WebAssembly.Instance(this._module, initializedImports)

    if (instance.exports.main) {
      instance.exports.main()
    }
    await this.onDone()
    return responses
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
}
