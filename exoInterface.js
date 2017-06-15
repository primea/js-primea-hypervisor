const EventEmitter = require('events')
const PortManager = require('./portManager.js')
const Message = require('primea-message')

module.exports = class ExoInterface extends EventEmitter {
  /**
   * the ExoInterface manages the varous message passing functions and provides
   * an interface for the containers to use
   * @param {Object} opts
   * @param {Object} opts.id
   * @param {Object} opts.state
   * @param {Object} opts.hypervisor
   * @param {Object} opts.Container
   */
  constructor (opts) {
    super()
    this.state = opts.state
    this.hypervisor = opts.hypervisor
    this.id = opts.id
    this.container = new opts.container.Constructor(this, opts.container.args)

    this.ticks = 0
    this.containerState = 'idle'
    this._waitingMap = new Map()

    // create the port manager
    this.ports = new PortManager(Object.assign({
      exoInterface: this
    }, opts))

    // once we get an result we run the next message
    this.on('result', this._runNextMessage)
  }

  /**
   * adds a message to this containers message queue
   * @param {Message} message
   */
  queue (portName, message) {
    message._hops++
    if (this.containerState !== 'running') {
      this._updateContainerState('running')
      if (portName) {
        this._runNextMessage()
      } else {
        this.run(message, true).then(() => {
          this._runNextMessage()
        })
      }
    }
  }

  _updateContainerState (containerState, message) {
    this.containerState = containerState
    this.emit(containerState, message)
  }

  async _runNextMessage () {
    if (this.ports.hasMessages()) {
      const message = this.ports.nextMessage()
      this.ticks = message._ticks
      this.hypervisor.scheduler.update(this, this.ticks)
      await this.hypbervisor.scheduler.wait(this.ticks)
      this.currentMessage = message
        // run the next message
      this.run(message)
    } else {
      // if no more messages then shut down
      this._updateContainerState('idle')
    }
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   * @returns {Promise}
   */
  async run (message, init) {
    let result
    try {
      if (init) {
        result = await this.container.run(message) || {}
      } else {
        result = await this.container.initailize(message) || {}
      }
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }
    return result
  }

  /**
   * updates the number of ticks that the container has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    this.ticks += count
    this.hypervisor.scheduler.update(this, this.ticks)
  }

  /**
   * creates a new message
   * @param {*} data
   */
  createMessage (opts) {
    const message = new Message(opts)
    for (const port of message.ports) {
      if (this.ports.isBound(port)) {
        throw new Error('message must not contain bound ports')
      }
    }
    return message
  }

  /**
   * sends a message to a given port
   * @param {Object} portRef - the port
   * @param {Message} message - the message
   */
  async send (port, message) {
    // set the port that the message came from
    message._fromPortTicks = this.ticks
    if (port.destId) {
      const id = port.destId
      const instance = await this.hypervisor.getInstance(id)
      instance.queue(port.destName, message)
    } else {
      port.destPort.messages.push(message)
    }
  }
}
