const EventEmitter = require('events')
const binarySearchInsert = require('binary-search-insert')

// decides which message to go first
function comparator (messageA, messageB) {
  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks > messageB._fromTicks
  } else {
    return Buffer.compare(messageA._fromId.id, messageB._fromId.id)
  }
}

module.exports = class Scheduler extends EventEmitter {
  /**
   * The Scheduler manages the actor instances and tracks how many "ticks" they
   * have ran.
   */
  constructor (hypervisor) {
    super()
    this.hypervisor = hypervisor
    this._messages = []
    this._times = []
    this.actors = new Map()
    this.drivers = new Map()
    this._running = false
  }

  queue (messages) {
    messages.forEach(msg => binarySearchInsert(this._messages, comparator, msg))
    if (!this._running) {
      this._running = true
      this._messageLoop()
    }
  }

  async _messageLoop () {
    while (this._messages.length) {
      const message = this._messages.shift()
      await this._processMessage(message)
    }
    this._running = false
    this.actors.forEach(actor => actor.shutdown())
    this.actors.clear()
    this.emit('idle')
  }

  async _processMessage (message) {
    const to = message.funcRef.actorId.toString()
    let actor = this.actors.get(to) || this.drivers.get(to)
    if (!actor) {
      actor = await this.hypervisor.loadActor(message.funcRef.actorId)
      this.actors.set(to, actor)
    }
    return actor.runMessage(message)
  }
}
