const EventEmitter = require('events')
const Vertex = require('merkle-trie')
const PortManager = require('./portManager.js')
const StateInterface = require('./stateInterface.js')
const imports = require('./EVMinterface.js')
const codeHandler = require('./codeHandler.js')
const common = require('./common.js')

module.exports = class Kernel extends EventEmitter {
  constructor (opts = {}) {
    super()
    const state = this.state = opts.state || new Vertex()
    this.stateInterface = new StateInterface(state)
    this.code = opts.code || state.value
    this.path = state.path
    this.imports = opts.imports || [imports]
    this.ports = new PortManager(state, opts.parent, Kernel)
    this._sentAtomicMessages = []
    // rename sandbox?
    this._vm = (opts.codeHandler || codeHandler).init(this.code)
    this._state = 'idle'
    this.ports.on('message', index => {
      this.runNextMessage(index)
    })
  }

  runNextMessage (index = 0) {
    this.ports.peek(index).then(message => {
      if (message && (message.isCyclic(this) || this._state === 'idle')) {
        this.ports.remove(index)
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
    function revert () {
      // revert the state
      this.state.set([], oldState)
      // revert all the sent messages
      for (let msg in this._sentAtomicMessages) {
        msg.revert()
      }
      this.runNextMessage(0)
    }

    const oldState = this.state.copy()
    let result
    this._state = 'running'
    try {
      result = await this._vm.run(message, this, imports) || {}
    } catch (e) {
      console.log(e)
      result = {
        exception: true
      }
    }
    if (result.execption) {
      // failed messages
      revert()
    } else if (message.atomic) {
      // messages
      message._finish(result)
      message.result().then(result => {
        if (result.execption) {
          revert()
        } else {
          this.runNextMessage(0)
        }
      })
    } else {
      // non-atomic messages
      this.runNextMessage(0)
    }
    return result
  }

  async send (message) {
    // replace root with parent path to root
    let portName = message.nextPort()
    if (portName === common.ROOT) {
      message.to.shift()
      message.to = new Array(this.path.length).fill(common.PARENT).concat(message.to)
      portName = common.PARENT
    }
    message.addVistedKernel(message)
    this.lastMessage = message
    // console.log(portName, message)
    const port = await this.ports.get(portName)
    // save the atomic messages for possible reverts
    if (message.atomic) {
      this._sentAtomicMessages.push(message)
    }
    return port.send(message)
  }

  shutdown () {}
}
