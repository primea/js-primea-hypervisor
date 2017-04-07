const EventEmitter = require('events')
const PortManager = require('./portManager.js')
const codeHandler = require('./codeHandler.js')
const AtomicMessage = require('primea-message/atomic')

module.exports = class Kernel extends EventEmitter {
  constructor (opts = {}) {
    super()
    // set up the state
    this.graph = opts.graph
    this.path = opts.path || ''
    this.imports = opts.imports
    const state = this.state = opts.state || {}

    // set up the vm
    this._vm = (opts.codeHandler || codeHandler).init(opts.code || state)
    this._vmstate = 'idle'

    // set up ports
    this.ports = new PortManager({
      state: state,
      graph: this.graph,
      parentPort: opts.parentPort,
      Kernel: Kernel,
      imports: this.imports,
      path: this.path
    })

    this.ports.on('message', index => {
      this.runNextMessage(index)
    })
  }

  runNextMessage (index = 0) {
    // load the next message from port space
    return this.ports.peek(index).then(message => {
      if (message &&
          (this._vmstate === 'idle' ||
           (AtomicMessage.isAtomic(message) && message.isCyclic(this)))) {
        this._currentMessage = message
        this.ports.remove(index)
        return this.run(message)
      } else {
        this._vmstate = 'idle'
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
    const self = this
    function revert (oldState) {
      // revert the state
      clearObject(self.state)
      Object.assign(self.state, oldState)
    }

    // shallow copy
    const oldState = Object.assign({}, this.state)
    let result
    this._vmstate = 'running'
    try {
      result = await this._vm.run(message, this, imports) || {}
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }

    // if we trapped revert all the sent messages
    if (result.exception) {
      // revert to the old state
      revert(oldState)
      message._reject(result)
    } else if (AtomicMessage.isAtomic(message) && !message.hasResponded) {
      message.respond(result)
    }

    message._committed().then(() => {
      this.runNextMessage(0)
    }).catch((e) => {
      revert(oldState)
    })
    return result
  }

  async send (portName, message) {
    if (AtomicMessage.isAtomic(message)) {
      // record that this message has traveled thourgh this kernel. This is used
      // to detect re-entry
      message._visited(this, this._currentMessage)
    }
    return this.ports.send(portName, message)
  }

  shutdown () {
    this.ports.close()
  }
}

function clearObject (myObject) {
  for (var member in myObject) {
    delete myObject[member]
  }
}
