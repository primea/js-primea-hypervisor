const EventEmitter = require('events')

module.exports = class Scheduler extends EventEmitter {
  /**
   * The Scheduler manages the actor instances and tracks how many "ticks" they
   * have ran.
   */
  constructor (hypervisor, numOfThreads = 1) {
    super()
    this.hypervisor = hypervisor
    this._numOfThreads = numOfThreads
    this._messages = []
    this._processing = 0
    this.actors = new Map()
    this.drivers = new Map()
    this._running = false
  }

  queue (messages) {
    this._messages.push.apply(this._messages, messages)
    if (!this._running) {
      this._running = true
      this._messageLoop()
    }
  }
  async _messageLoop () {
    const promises = new Set()
    while (this._messages.length) {
      const message = this._messages.shift()
      let promise = this._processMessage(message).then(() => {
        promises.delete(promise)
      })
      promises.add(promise)
      if (promises.size >= this._numOfThreads) {
        await Promise.race(promises)
      }
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
