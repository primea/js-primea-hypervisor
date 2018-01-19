const Pipe = require('buffer-pipe')
const leb128 = require('leb128').unsigned
const Inbox = require('./inbox.js')

module.exports = class Actor {
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
    Object.assign(this, opts)

    this.inbox = new Inbox({
      actor: this,
      hypervisor: opts.hypervisor
    })

    this.ticks = 0
    this.running = false
  }

  /**
   * adds a message to this actor's message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (message) {
    this.inbox.queue(message)

    if (!this.running) {
      this.running = true
      this._startMessageLoop()
    }
  }

  // waits for the next message
  async _startMessageLoop () {
    // this ensure we only every have one loop running at a time
    while (!this.inbox.isEmpty) {
      const message = await this.inbox.nextMessage()
      await this.runMessage(message)
    }
    this.running = false
    // wait for state ops to finish
    await this.state.done()
    setTimeout(() => {
      if (!this.running) {
        this.shutdown()
      }
    }, 0)
  }

  serializeMetaData () {
    return Actor.serializeMetaData(this.type, this.nonce)
  }

  getFuncRef (name) {
    return {
      name,
      destId: this.id
    }
  }

  static serializeMetaData (type, nonce = 0) {
    const p = new Pipe()
    leb128.write(type, p)
    leb128.write(nonce, p)
    return p.buffer
  }

  static deserializeMetaData (buffer) {
    const pipe = new Pipe(buffer)
    const type = leb128.read(pipe)
    const nonce = leb128.read(pipe)
    return {
      nonce,
      type
    }
  }

  /**
   * Runs the shutdown routine for the actor
   */
  shutdown () {
    this.state.root['/'][3] = this.serializeMetaData()
    this.hypervisor.scheduler.done(this.id)
  }

  /**
   * Runs the startup routine for the actor
   */
  async startup () {
    this.instance = await this.container.instance(this)
  }

  /**
   * run the Actor with a given message
   * @param {object} message - the message to run
   * @param {String} method - which method to run
   * @returns {Promise}
   */
  async runMessage (message) {
    try {
      this.currentMessage = message
      await this.instance.exports[message.funcRef.name](...message.funcArguments)
    } catch (e) {
      message.emit('execution:error', e)
    }
  }

  /**
   * updates the number of ticks that the actor has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    this.ticks += count
    this.hypervisor.scheduler.update(this)
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

    return this.hypervisor.send(message)
  }
}
