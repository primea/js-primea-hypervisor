const EventEmitter = require('events')
const Vertex = require('merkle-trie')
const PortManager = require('./portManager.js')
const imports = require('./EVMinterface.js')
const codeHandler = require('./codeHandler.js')
const common = require('./common.js')

module.exports = class Kernel extends EventEmitter {
  constructor (opts = {}) {
    super()
    const state = this.state = opts.state || new Vertex()
    this.code = opts.code || state.value
    this.path = state.path
    this.imports = opts.imports || [imports]
    this.ports = new PortManager(state, opts.parent, Kernel)
    // rename sandbox?
    this._vm = (opts.codeHandler || codeHandler).init(this.code)
    this._state = 'idle'
    this.ports.on('message', message => {
      // was this kernel already visted?
      if (message.isCyclic(this) || this._state === 'idle') {
        this.run(message)
      }
    })
  }

  runNextMessage () {
    this.ports.dequeue().then(message => {
      if (message) {
        this.run(message)
      } else {
        this._state = 'idle'
        this.emit('idle')
      }
    })
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message, imports = this.imports) {
    this._state = 'running'
    const oldState = this.state.copy()
    const result = await this._vm.run(message, this, imports) || {}

    function revert () {
      // revert the state
      this.state.set([], oldState)
      // revert all the sent messages
      this.ports.outbox.revert()
      this.runNextMessage()
    }

    if (result.execption) {
      // failed messages
      revert()
    } else if (message.atomic) {
      // messages
      message.finished().then(this.runNextMessage).catch(revert)
    } else {
      // non-atomic messages
      this.runNextMessage()
    }
    return result
  }

  async send (message) {
    let portName = message.nextPort()
    message.addVistedKernel(message)
    this.lastMessage = message
    // replace root with parent path to root
    if (portName === common.ROOT) {
      portName = common.PARENT
      message.to = new Array(this.path.length).fill(common.PARENT).concat(message.to)
    }
    const port = await this.ports.get(portName)
    return port.send(message)
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

  // remove from cache
  shutdown () {}
}
