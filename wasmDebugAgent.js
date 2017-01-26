const Wasm = require('./wasmAgent')

module.exports = class Test extends Wasm {
  /**
   * Runs the core VM with a given environment and imports
   */
  async run (message, kernel, imports) {
    const responses = this.responses = {}
    /**
     * Builds a import map with an array of given interfaces
     */
    async function buildImports (kernelApi, kernel, imports) {
      const importMap = {}
      for (const Import of imports) {
        const response = responses[Import.name] = {}
        const newIterface = new Import(kernelApi, message, response)
        importMap[Import.name] = newIterface.exports
        // initailize the import
        await newIterface.initialize()
      }
      return importMap
    }

    let instance
    const interfaceApi = this.api = {
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

    const initializedImports = await buildImports(interfaceApi, kernel, imports)
    this.instance = instance = WebAssembly.Instance(this._module, initializedImports)

    if (instance.exports.main) {
      instance.exports.main()
    }
    await this.onDone()
    return responses
  }
}
