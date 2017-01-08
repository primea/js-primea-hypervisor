const Vertex = require('merkle-trie')
// The Kernel Exposes this Interface to VM instances it makes
const Imports = require('./EVMimports.js')
const VM = require('./vm.js')
const Environment = require('./environment.js')

module.exports = class Kernel {
  constructor (opts = {}) {
    opts.state = opts.state || new Vertex(opts.code)
    opts.code = opts.state.value || opts.code

    // if code is bound to this kernel then create the interfaceAPI and the imports
    this._vm = new VM(opts.code)
    this.imports = buildImports(this._vm, opts.interfaces)

    /**
     * Builds a import map with an array of given interfaces
     */
    function buildImports (api, imports = [Imports]) {
      return imports.reduce((obj, InterfaceConstuctor) => {
        obj[InterfaceConstuctor.name] = new InterfaceConstuctor(api).exports
        return obj
      }, {})
    }
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (environment = new Environment({state: this}), imports = this.imports) {
    await this._vm.run(environment, imports)
  }

  async messageReceiver (message) {
    // let the code handle the message if there is code
    const environment = new Environment(message)
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
