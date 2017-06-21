const PortManager = require('./portManager.js')
const Message = require('primea-message')

module.exports = class ExoInterface {
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
    this.state = opts.state
    this.hypervisor = opts.hypervisor
    this.id = opts.id
    this.container = new opts.container.Constructor(this, opts.container.args)

    this.ticks = 0
    this.containerState = 'idle'

    // create the port manager
    this.ports = new PortManager(Object.assign({
      exInterface: this
    }, opts))
  }

  /**
   * adds a message to this containers message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (portName, message) {
    message._hops++
    this.ports.queue(portName, message)
    if (this.containerState !== 'running') {
      this.containerState = 'running'
      if (portName) {
        this._runNextMessage()
      } else {
        this.run(message, true)
      }
    }
  }

  // waits for the next message
  async _runNextMessage () {
    // check if the ports are saturated, if so we don't have to wait on the
    // scheduler
    if (!this.ports.isSaturated()) {
      await this.hypervisor.scheduler.wait(this.ticks, this.id)
    }

    let message = this.ports.peekNextMessage()
    if (message) {
      if (this.ticks < message._fromTicks) {
        this.ticks = message._fromTicks
          // check for tie messages
        this.hypervisor.scheduler.update(this)
        if (!this.ports.isSaturated()) {
          await this.hypervisor.scheduler.wait(this.ticks, this.id)
          message = this.ports.peekNextMessage()
        }
      }
      message.fromPort.messages.shift()
      // run the next message
      this.run(message)
    } else {
      // if no more messages then shut down
      this.hypervisor.scheduler.done(this)
    }
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   * @returns {Promise}
   */
  async run (message, init = false) {
    let result
    message.ports.forEach(port => this.ports._unboundPorts.add(port))
    if (message.data === 'delete') {
      this.ports._delete(message.fromName)
    } else {
      const method = init ? 'initailize' : 'run'

      try {
        result = await this.container[method](message) || {}
      } catch (e) {
        result = {
          exception: true,
          exceptionError: e
        }
      }
    }
    this.ports.clearUnboundedPorts()
    // message.response(result)
    this._runNextMessage()
    return result
  }

  /**
   * updates the number of ticks that the container has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    this.ticks += count
    this.hypervisor.scheduler.update(this)
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
    message._fromTicks = this.ticks
    message.ports.forEach(port => this.ports._unboundPorts.delete(port))

    // if (this.currentMessage !== message && !message.responsePort) {
    //   this.currentMessage._addSubMessage(message)
    // }

    if (port.destId) {
      const id = port.destId
      const instance = await this.hypervisor.getInstance(id)
      instance.queue(port.destName, message)
    } else {
      port.destPort.messages.push(message)
    }
  }
}
