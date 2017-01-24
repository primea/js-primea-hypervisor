const Vertex = require('merkle-trie')
const Cache = require('imperative-trie')
const imports = require('./EVMinterface.js')
const codeHandler = require('./codeHandler.js')
const MessageQueue = require('./messageQueue')

const PARENT_SYMBOL = Symbol('parent')
const ROOT_SYMBOL = Symbol('root')

module.exports = class Kernel {
  constructor (opts = {}) {
    const state = this.state = opts.state || new Vertex()
    state.value = opts.code || state.value
    this.imports = opts.imports || [imports]
    // RENAME agent
    this._vm = (opts.codeHandler || codeHandler).init(state.value)
    this._messageQueue = new MessageQueue(this)
    this._instanceCache = new Cache()
  }

  static get PARENT () {
    return PARENT_SYMBOL
  }

  static get ROOT () {
    return ROOT_SYMBOL
  }

  get PARENT () {
    return PARENT_SYMBOL
  }

  get ROOT () {
    return ROOT_SYMBOL
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message, imports = this.imports) {
    const state = this.state.copy()
    const result = await this._vm.run(message, this, imports, state)
    if (!result.execption) {
      // update the state
      this.state.set([], state)
    }
    return result
  }

  async recieve (message) {
    if (message.isCyclic(this)) {
      const result = await this.run(message)
      message.finished()
      return result
    } else {
      return this._messageQueue.add(message)
    }
  }

  async send (port, message) {
    message.sending(this, this._messageQueue.currentMessage)
    // replace root with parent path to root
    if (port === ROOT_SYMBOL) {
      port = PARENT_SYMBOL
      message.to = new Array(this.state.path.length - 1).fill(PARENT_SYMBOL).concat(message.to)
    }

    if (port === PARENT_SYMBOL) {
      message.from.push(this.state.name)
    } else {
      message.from.push(this.PARENT)
    }

    const dest = await this.getPort(port)
    return dest.recieve(message)
  }

  setValue (name, value) {
    return this.state.set(name, value)
  }

  getValue (name) {
    return this.state.get(name)
  }

  async getPort (name) {
    let kernel
    if (name === this.PARENT) {
      kernel = this.parent
    } else {
      kernel = this._instanceCache.get(name)
    }

    if (kernel) {
      return kernel
    } else {
      const destState = await (
        name === this.PARENT
        ? this.state.getParent()
        : this.state.get([name]))

      const kernel = new Kernel({
        state: destState
      })

      const cache = new Cache({value: kernel})
      kernel._instanceCache = cache

      this._instanceCache.set(name, kernel)
      return kernel
    }
  }
}
