const Vertex = require('merkle-trie')
// The Kernel Exposes this Interface to VM instances it makes
const defaultInterface = require('./EVMinterface.js')
const VM = require('./vm.js')
const Environment = require('./environment.js')

module.exports = class Kernel {
  constructor (opts = {}) {
    this.state = opts.state || new Vertex()
    this.state.value = opts.code || this.state.value
    this.interfaces = opts.interfaces || [defaultInterface]
    this._vm = new VM(this.state.value)
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (environment = new Environment({state: this}), interfaces = this.interfaces) {
    /**
     * Builds a import map with an array of given interfaces
     */
    async function buildImports (kernelApi, imports, state) {
      const result = {}
      for (const Import of imports) {
        const newIterface = new Import(kernelApi)
        result[Import.name] = newIterface.exports
        // initailize the import
        await newIterface.initialize(state)
      }
      return result
    }

    const initializedImports = await buildImports(this._vm, interfaces, this.state)
    return await this._vm.run(environment, initializedImports)
  }

  async messageReceiver (message) {
    // let the code handle the message if there is code
    const environment = new Environment({
      message: message
    })
    let result = await this.run(environment)
    if (!result.execption) {
      this.state = result.state
    }
  }

  copy () {
    return new Kernel({
      state: this.state.copy(),
      code: this.code,
      interfaces: this.interfaces,
      parent: this.parent
    })
  }
}
