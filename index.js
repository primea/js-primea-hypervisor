const EventEmitter = require('events')
const Vertex = require('merkle-trie')
const PortManager = require('./portManager.js')
const imports = require('./EVMinterface.js')
const codeHandler = require('./codeHandler.js')

module.exports = class Kernel extends EventEmitter {
  constructor (opts = {}) {
    super()
    // set up the state
    const state = this.state = opts.state || new Vertex()
    this.path = state.path

    // set up the vm
    this.imports = opts.imports || [imports]
    this._vm = (opts.codeHandler || codeHandler).init(opts.code || state.value)
    this._state = 'idle'

    // set up ports
    this.ports = new PortManager(state, opts.parentPort, Kernel)
    this._sentAtomicMessages = []
    this.ports.on('message', index => {
      this.runNextMessage(index)
    })
  }

  runNextMessage (index = 0) {
    // load the next message from port space
    return this.ports.peek(index).then(message => {
      if (message && (message._isCyclic(this) || this._state === 'idle')) {
        this._currentMessage = message
        this.ports.remove(index)
        return this.run(message)
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
    function revert (oldState) {
      // revert the state
      this.state.set([], oldState)
      // revert all the sent messages
      for (let msg in this._sentAtomicMessages) {
        msg.revert()
      }
    }

    const oldState = this.state.copy()
    let result
    this._state = 'running'
    try {
      result = await this._vm.run(message, this, imports) || {}
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }

    if (message.atomic) {
      // if we trapped revert all the sent messages
      if (result.execption) {
        // revert to the old state
        revert(oldState)
      }
      message._finish()
      message.result().then(result => {
        if (result.execption) {
          revert()
        } else {
          this.runNextMessage(0)
        }
      })

      if (message.hops === message.to.length || result.exception) {
        message._respond(result)
      }
    } else {
      // non-atomic messages
      this.runNextMessage(0)
    }
    return result
  }

  async send (message) {
    if (message.atomic) {
      // record that this message has traveled thourgh this kernel. This is used
      // to detect re-entry
      message._visited(this, this._currentMessage)
      // recoded that this message was sent, so that we can revert it if needed
      this._sentAtomicMessages.push(message)
    }
    return this.ports.send(message)
  }

  shutdown () {
    this.ports.close()
  }
}
