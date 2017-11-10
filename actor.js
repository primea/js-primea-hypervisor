const Message = require('primea-message')
const AddressBook = require('./addressBook.js')

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
    this.code = opts.code
    this.treeNode = opts.treeNode
    this.hypervisor = opts.hypervisor
    this.id = opts.id
    this.container = new opts.container.Constructor(this, opts.container.args)

    this.ticks = 0
    this.containerState = 'idle'

    // create the port manager
    this.addressBook = new AddressBook(Object.assign({
      kernel: this
    }, opts))
  }

  /**
   * adds a message to this containers message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (port, message) {
    this.ports.queue(port.destName, message)
    this._startMessageLoop()
  }

  async create (message) {
    await this.message(message, 'onCreation')
    this._startMessageLoop()
  }

  // waits for the next message
  async _startMessageLoop () {
    // this ensure we only every have one loop running at a time
    if (this.containerState !== 'running') {
      this.containerState = 'running'
      while (1) {
        const message = await this.ports.getNextMessage()
        if (!message) break

        // dequqe message
        message.fromPort.messages.shift()
        // if the message we recived had more ticks then we currently have then
        // update it
        if (message._fromTicks > this.ticks) {
          this.ticks = message._fromTicks
          this.hypervisor.scheduler.update(this)
        }
        // run the next message
        await this.message(message)
      }

      this.containerState = 'idle'
      this.container.onIdle()
    }
  }

  shutdown () {
    this.hypervisor.scheduler.done(this.id)
  }

  startup () {
    return this.container.onStartup()
  }

  /**
   * run the kernels code with a given enviroment
   * @param {object} message - the message to run
   * @param {boolean} init - whether or not to run the intialization routine
   * @returns {Promise}
   */
  async message (message, method = 'onMessage') {
    const responsePort = message.responsePort
    delete message.responsePort

    this.ports.addReceivedPorts(message)
    let result
    try {
      result = await this.container[method](message)
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }

    if (responsePort) {
      this.ports._unboundPorts.add(responsePort)
      this.send(responsePort, new Message({
        data: result
      }))
    }
    this.ports.clearUnboundedPorts()
  }

  getResponsePort (message) {
    const portRef = this.hypervisor.getResponsePort(message)
    this.ports._unboundPorts.add(portRef)
    return portRef
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

  generateNextId () {
    const id = {
      nonce: this.state.nonce,
      parent: this.id
    }

    this.state.nonce++
    return id
  }

  /**
   * sends a message to a given port
   * @param {Object} portRef - the port
   * @param {Message} message - the message
   */
  send (port, message) {
    message._hops++
    message._fromTicks = this.ticks
    message.fromId = this.id
    this.ports.removeSentPorts(message)

    return this.hypervisor.send(port, message)
  }
}
