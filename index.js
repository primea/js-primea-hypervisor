const Vertex = require('merkle-trie')
const Port = require('./port.js')
const imports = require('./EVMinterface.js')
const codeHandler = require('./codeHandler.js')
const MessageQueue = require('./messageQueue')
const common = require('./common.js')

module.exports = class Kernel {
  constructor (opts = {}) {
    const state = this.state = opts.state || new Vertex()
    this.code = opts.code || state.value
    this.path = state.path
    this.imports = opts.imports || [imports]
    // RENAME agent
    this._vm = (opts.codeHandler || codeHandler).init(this.code)
    this._messageQueue = new MessageQueue(this)
    this.ports = new Port(state, Kernel)
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message, imports = this.imports) {
    // const state = this.state.copy()
    const result = await this._vm.run(message, this, imports)
    // if (!result.execption) {
    //   // update the state
    //   this.state.set([], state)
    // }
    message.finished()
    return result
  }

  async recieve (message) {
    if (message.isCyclic(this)) {
      const result = await this.run(message)
      return result
    } else {
      return this._messageQueue.add(message)
    }
  }

  async send (port, message) {
    message.addVistedKernel(this)
    // replace root with parent path to root
    if (port === common.ROOT) {
      port = common.PARENT
      message.to = new Array(this.state.path.length).fill(common.PARENT).concat(message.to)
    }
    return this.ports.send(port, message)
  }

  setValue (name, value) {
    this.state.set(name, value)
  }

  getValue (name) {
    return this.state.get(name)
  }

  deleteValue (name) {
    return this.state.del(name)
  }
}
