const errors = require('./errors.json')
const nope = () => {}

module.exports = class Actor {
  /**
   * the Actor manages the various message passing functions and provides
   * an interface for the containers to use
   * @param {Object} opts
   * @param {ID} opts.id - the UUID of the Actor
   * @param {Object} opts.module - the module this actor was created from
   * @param {Object} opts.state - the state of the module
   * @param {Object} opts.storage - the actor's persistent storage
   * @param {Object} opts.hypervisor - the instance of the hypervisor
   * @param {Number} opts.nonce
   * @param {Function} opts.Container - the module constructor and arguments
   */
  constructor (opts) {
    Object.assign(this, opts)

    this.ticks = 0
    this.running = false
    this.container = new this.Container(this)
    if (!this.hypervisor.meter) {
      this.incrementTicks = nope
    }
  }

  /**
   * Runs the shutdown routine for the actor
   */
  shutdown () {
    // saves the nonce and storage to the state
    this.state.value[1] = this.nonce
    this.state.node[2] = {'/': this.storage}
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
      this.ticks = message._fromTicks
    }
    try {
      this.currentMessage = message
      await this.container.onMessage(message)
    } catch (e) {
      message.emit('execution:error', e)
    }
    message.emit('done', this)
  }

  /**
   * updates the number of ticks that the actor has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    this.currentMessage.funcRef.gas -= count
    if (this.currentMessage.funcRef.gas < 0) {
      throw new Error(errors.OUT_OF_GAS)
    }
    this.ticks += count
  }

  /**
   * creates an actor from a module and code
   * @param {Module} mod - the module
   * @param {Buffer} code - the code
   * @return {ActorRef}
   */
  newActor (mod, code) {
    const modRef = this.createModule(mod, code)
    return this.createActor(modRef)
  }

  /**
   * creates a modref from a module and code
   * @param {Module} mod - the module
   * @param {Buffer} code - the code
   * @return {ModuleRef}
   */
  createModule (mod, code) {
    const id = this._generateNextId()
    return this.hypervisor.createModule(mod, code, id)
  }

  /**
   * creates an actor from a modref
   * @param {ModuleRef} modRef - the modref
   * @return {ActorRef}
   */
  createActor (modRef) {
    const id = this._generateNextId()
    return this.hypervisor.createActor(modRef, id)
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
   * sends a message
   * @param {Message} message - the message
   */
  send (message) {
    message._fromTicks = this.ticks
    message._fromId = this.id

    this.incrementTicks(message.funcRef.gas)
    this.hypervisor.scheduler.queue([message])
  }
}
