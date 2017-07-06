const Message = require('primea-message')
const BN = require('bn.js')
const PortManager = require('./portManager.js')
const DeleteMessage = require('./deleteMessage')

module.exports = class Kernel {
  /**
   * the Kernel manages the varous message passing functions and provides
   * an interface for the containers to use
   * @param {Object} opts
   * @param {Object} opts.id - the UUID of the Kernel
   * @param {Object} opts.state - the state of the container
   * @param {Object} opts.hypervisor
   * @param {Object} opts.container - the container constuctor and argments
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
      kernel: this
    }, opts))
  }

  /**
   * adds a message to this containers message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (portName, message) {
    this.ports.queue(portName, message)
    if (this.containerState !== 'running') {
      this.containerState = 'running'
      return this._runNextMessage()
    }
  }

  initialize (message) {
    this.containerState = 'running'
    return this.run(message, 'initialize')
  }

  // waits for the next message
  async _runNextMessage () {
    // check if the ports are saturated, if so we don't have to wait on the
    // scheduler
    const message = await this.ports.getNextMessage()

    if (message) {
      message.fromPort.messages.shift()
      // if the message we recived had more ticks then we currently have the
      // update it
      if (message._fromTicks > this.ticks) {
        this.ticks = message._fromTicks
        this.hypervisor.scheduler.update(this)
      }
      // run the next message
      return this.run(message)
    } else {
      // if no more messages then shut down
      this.hypervisor.scheduler.done(this.id)
    }
  }

  /**
   * run the kernels code with a given enviroment
   * @param {object} message - the message to run
   * @param {boolean} init - whether or not to run the intialization routine
   * @returns {Promise}
   */
  async run (message, method = 'run') {
    let result

    const responsePort = message.responsePort
    delete message.responsePort

    this.ports.addReceivedPorts(message)
    message._hops++

    if (message.constructor === DeleteMessage) {
      this.ports._delete(message.fromName)
    } else {
      try {
        result = await this.container[method](message) || {}
      } catch (e) {
        result = {
          exception: true,
          exceptionError: e
        }
      }
    }

    if (responsePort) {
      this.send(responsePort, new Message({
        data: result
      }))
      this.ports._unboundPorts.add(responsePort)
    }

    this.ports.clearUnboundedPorts()
    return this._runNextMessage()
  }

  getResponsePort (message) {
    if (message.responsePort) {
      return message.responsePort.destPort
    } else {
      const [portRef1, portRef2] = this.ports.createChannel()
      message.responsePort = portRef2
      this.ports._unboundPorts.delete(portRef2)
      return portRef1
    }
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
    this.ports.checkSendingPorts(message)
    return message
  }

  /**
   * creates a new container. Returning a port to it.
   * @param {String} type
   * @param {*} data - the data to populate the initail state with
   * @returns {Object}
   */
  createInstance (type, message) {
    let nonce = this.state.nonce

    const id = {
      nonce: nonce,
      parent: this.id
    }

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state.nonce = nonce.toArray()
    this.ports.removeSentPorts(message)

    return this.hypervisor.createInstance(type, message, id)
  }

  /**
   * sends a message to a given port
   * @param {Object} portRef - the port
   * @param {Message} message - the message
   */
  async send (port, message) {
    // set the port that the message came from
    message._fromTicks = this.ticks
    this.ports.removeSentPorts(message)

    // if (this.currentMessage !== message && !message.responsePort) {
    //   this.currentMessage._addSubMessage(message)
    // }

    if (port.destId) {
      const id = port.destId
      const instance = await this.hypervisor.getInstance(id)
      return instance.queue(port.destName, message)
    } else {
      // port is unbound
      port.destPort.messages.push(message)
    }
  }
}
