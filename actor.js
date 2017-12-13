const Buffer = require('safe-buffer').Buffer
const Pipe = require('buffer-pipe')
const Cap = require('primea-capability')
const Message = require('primea-message')
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

    this.container = new opts.container.Constructor(this, opts.container.args)
    this.inbox = new Inbox({
      actor: this,
      hypervisor: opts.hypervisor
    })

    this.ticks = 0
    this.running = false
  }

  /**
   * Mints a new capabilitly with a given tag
   * @param {*} tag - a tag which can be used to identify caps
   * @return {Object}
   */
  mintCap (tag = 0, funcIndex = 0) {
    return new Cap(this.id, tag, funcIndex)
  }

  /**
   * adds a message to this actor's message queue
   * @param {string} portName
   * @param {object} message
   */
  queue (message) {
    this.inbox.queue(message)
    this._startMessageLoop()
  }

  /**
   * runs the creation routine for the actor
   * @param {object} message
   * @returns {Promise}
   */
  create (message) {
    this.running = true
    return this.runMessage(message, 'onCreation').then(() => {
      this.running = false
      this._startMessageLoop()
    })
  }

  // waits for the next message
  async _startMessageLoop () {
    // this ensure we only every have one loop running at a time
    if (!this.running) {
      this.running = true
      while (1) {
        const message = await this.inbox.nextMessage(0, true)
        if (!message) break

        // run the next message
        await this.runMessage(message)
        // wait for state ops to finish
        await this.state.done()
      }

      this.running = false
      this.container.onIdle()
    }
  }

  serializeMetaData () {
    return Actor.serializeMetaData(this.type, this.transparent, this.nonce)
  }

  static serializeMetaData (type, transparent = 0, nonce = 0) {
    const p = new Pipe()
    leb128.write(type, p)
    p.write(Buffer.from([0]))
    leb128.write(nonce, p)
    return p.buffer
  }

  static deserializeMetaData (buffer) {
    const pipe = new Pipe(buffer)
    const type = leb128.read(pipe)
    pipe.read(1)
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
  startup () {
    return this.container.onStartup()
  }

  /**
   * run the Actor with a given message
   * @param {object} message - the message to run
   * @param {String} method - which method to run
   * @returns {Promise}
   */
  async runMessage (message, method = 'onMessage') {
    let result
    try {
      result = await this.container[method](message)
    } catch (e) {
      message.emit('execution:error', e)
      result = {
        exception: true,
        exceptionError: e
      }
    }

    if (message.responseCap) {
      this.send(message.responseCap, new Message({
        data: result
      }))
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
  createActor (type, message) {
    const id = this._generateNextId()
    return this.hypervisor.createActor(type, message, id)
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
  send (cap, message) {
    message._fromTicks = this.ticks
    message._fromId = this.id
    message.tag = cap.tag

    return this.hypervisor.send(cap, message)
  }
}
