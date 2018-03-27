const EventEmitter = require('events')

module.exports = class Actor extends EventEmitter {
  /**
   * the Actor manages the varous message passing functions and provides
   * an interface for the containers to use
   * @param {Object} opts
   * @param {Object} opts.id - the UUID of the Actor
   * @param {Object} opts.state - the state of the container
   * @param {Object} opts.hypervisor - the instance of the hypervisor
   * @param {Object} opts.container - the container constuctor and argments
   */
  constructor (opts) {
    super()
    Object.assign(this, opts)

    this.inbox = []
    this.ticks = 0
    this.running = false
    this.container = new this.Container(this)
  }

  /**
   * adds a message to this actor's message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (message) {
    this.inbox.push(message)

    if (!this.running) {
      this.hypervisor.scheduler.addTime(this.ticks)
      this.running = true
      return this._startMessageLoop()
    }
  }

  // waits for the next message
  async _startMessageLoop () {
    // this ensure we only every have one loop running at a time
    while (this.inbox.length) {
      const message = this.inbox.shift()
      await this.runMessage(message)
    }
    this.hypervisor.scheduler.removeTime(this.ticks)
    this.emit('idle')
    this.running = false
  }

  /**
   * Runs the shutdown routine for the actor
   */
  async shutdown () {
    await this.tree.set(this.id.id, [this.type, this.nonce])
    const state = await this.tree.get(this.id.id)
    return this.tree.graph.set(state.root, '2', this.storage)
  }

  /**
   * Runs the startup routine for the actor
   */
  startup () {
    return this.container.onStartup()
  }

  /**
   * run the Actor with a given message
   * @param {object} message - the message to run
   * @param {String} method - which method to run
   * @returns {Promise}
   */
  async runMessage (message) {
    if (message._fromTicks > this.ticks) {
      this.hypervisor.scheduler.update(this.ticks, message._fromTicks)
      this.ticks = message._fromTicks
    }
    try {
      this.currentMessage = message
      await this.container.onMessage(message)
    } catch (e) {
      message.emit('execution:error', e)
    }
    message.emit('done')
  }

  /**
   * updates the number of ticks that the actor has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    const oldValue = this.ticks
    this.ticks += count
    this.hypervisor.scheduler.update(oldValue, this.ticks)
  }

  /**
   * creates an actor
   * @param {Integer} type - the type id for the container
   * @param {Object} message - an intial [message](https://github.com/primea/js-primea-message) to send newly created actor
   */
  createActor (type, code) {
    const id = this._generateNextId()
    return this.hypervisor.createActor(type, code, id)
  }

  _generateNextId () {
    const id = {
      nonce: this.nonce,
      parent: this.id
    }

    this.nonce++
    return id
  }

  /**
   * sends a message to a given port
   * @param {Object} portRef - the port
   * @param {Message} message - the message
   */
  send (message) {
    message._fromTicks = this.ticks
    message._fromId = this.id

    this.hypervisor.scheduler.queue([message])
  }
}
