const crypto = require('webcrypto-liner')
const PriorityQueue = require('fastpriorityqueue')
const EventEmitter = require('events')
const PortManager = require('./portManager.js')

const STATES = ['idle', 'running', 'result']

module.exports = class Kernel extends EventEmitter {
  constructor (opts = {}) {
    super()
    // set up the state
    this.opts = {}
    this._stateIndex = 0
    Object.assign(this.opts, opts)
    // set up the vm
    this.vm = (this.opts.codeHandler).init(this.opts.state)
    this.ports = new PortManager(this)
    this._waitingQueue = new PriorityQueue((a, b) => {
      return a.threshold > b.threshold
    })
    this.on('result', this._runNextMessage)
  }

  _updateState (message) {
    this._stateIndex++
    const state = STATES[this._stateIndex]
    this._emit(state, message)
  }

  get state () {
    return STATES[this._stateIndex]
  }

  queue (message) {
    this.portManager.queue(message)
    // handle system messages
    if (message.isPoll) {
      message.respond(this.wait(message.threshold))
    } else if (this.state === 'idle') {
      this._runNextMessage()
    }
  }

  _runNextMessage () {
    this.portManager.getNextMessage(this.ticks).then(message => {
      if (message) {
        this.run(message)
      } else {
        this._updateState()
      }
    })
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message, imports = this.imports) {
    // shallow copy
    const oldState = Object.assign({}, this.state)
    let result
    this._updateState(message)
    try {
      result = await this._vm.run(message, this, imports) || {}
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }

    if (result.exception) {
      // revert to the old state
      clearObject(this.opts.state)
      Object.assign(this.opts.state, oldState)
    }

    this._updateState(result)
    return result
  }

  // returns a promise that resolves once the kernel hits the threshould tick
  // count
  async wait (threshold) {
    if (this._state === 'idle' && threshold > this.ticks) {
      // the cotract is at idle so wait
      return this.portManager.wait(threshold)
    } else {
      return new Promise((resolve, reject) => {
        if (threshold <= this.ticks) {
          resolve(this.ticks)
        } else {
          this._waitingQueue.add({
            threshold: threshold,
            resolve: resolve
          })
        }
      })
    }
  }

  _updateTickCount (count) {
    this.ticks = count
    while (this._waitingQueue.peek().threshold <= count) {
      this._waitingQueue.poll().resolve(count)
    }
  }

  createPort () {
    return {
      id: {
        '/': [this.nonce++, this.id]
      },
      link: {
        '/': {}
      }
    }
  }

  async send (port, message) {
    return this.opts.hypervisor.send(port, message)
  }

  id () {
    return Kernel.id(this._opts, this._opts)
  }

  static id (id) {
    return crypto.subtle.digest('SHA-256', Buffer.concat(id.parentId, id.nonce))
  }
}

function clearObject (myObject) {
  for (var member in myObject) {
    delete myObject[member]
  }
}
