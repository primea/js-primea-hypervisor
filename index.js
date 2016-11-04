/**
 * This implements the Kernel
 * Kernels must implement two methods `codeHandler` and `callHandler` (and `linkHandler` for sharding)
 * The Kernel Contract handles the following
 * - Interprocess communications
 * - Intializing the VM and exposes ROM to it (codeHandler)
 * - Expose namespace which VM instance exists and Intializes the Environment (callHandler)
 * - Provides some built in contract (runTx, runBlock)
 * - Provides resource sharing and limiting via gas
 *
 *   All State should be stored in the Environment.
 */

const Vertex = require('./deps/kernelVertex')
// The Kernel Exposes this Interface to VM instances it makes
const Interface = require('./interface.js')
const InterfaceAPI = require('./interfaceAPI.js')

// The Kernel Stores all of its state in the Environment. The Interface is used
// to by the VM to retrive infromation from the Environment.
const Environment = require('./environment.js')
module.exports = class Kernel {
  constructor (opts = {}) {
    this.state = opts.state || new Vertex()
    this.parent = opts.parent

    if (opts.code) {
      this.interfaceAPI = new InterfaceAPI(opts.code)
    }
    this.imports = this.buildImports(opts.interfaces)
  }

  buildImports (interfaces = [Interface]) {
    return interfaces.reduce((obj, Interface) => {
      obj[Interface.name] = new Interface(this.interfaceAPI).exports
      return obj
    }, {})
  }

  // run the kernels code with a given enviroment
  async run (environment = new Environment({state: this.state}), imports = this.imports) {
    await this.interfaceAPI.run(environment, imports)
    return environment
  }

  async messageReceiver (message) {
    // let the code handle the message if there is code
    if (this.code) {
      const environment = new Environment(message)
      let result = await this.run(environment)
      if (!result.execption) {
        this.state = result.state
      }
    } else if (message.to.length) {
      // else forward the message on to the destination contract
      let [vertex, done] = await this.state.update(message.to)
      message.to = []
      await vertex.kernel.messageReceiver(message)
      done(vertex)
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
