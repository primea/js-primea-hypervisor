const EventEmitter = require('events')
const bs = require('binary-search')
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

module.exports = class ConcurrentScheduler extends EventEmitter {
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
    this._idles = Promise.resolve()
  }

  queue (messages) {
    messages.forEach(msg => binarySearchInsert(this._messages, comparator, msg))
    if (!this._running) {
      this._running = true
      this._messageLoop()
    }
  }

  async _messageLoop () {
    let waits = []
    while (this._messages.length) {
      let oldestMessage = this._messages[0]
      let message = this._messages[0]
      while (message && oldestMessage && oldestMessage._fromTicks === message._fromTicks) {
        message = this._messages.shift()
        waits.push(this._processMessage(message))
        oldestMessage = this._messages[0]
      }

      await Promise.all(waits)
      await this.onDone()
    }

    this._running = false
    const promises = []
    this.actors.forEach(actor => promises.push(actor.shutdown()))
    await Promise.all(promises)
    this.actors.clear()
    this.emit('idle')
  }

  async onDone () {
    let prevOps
    while (prevOps !== this._idles) {
      prevOps = this._idles
      await prevOps
    }
  }

  addTime (ticks) {
    binarySearchInsert(this._times, (a, b) => { return a - b }, ticks)
  }

  removeTime (ticks) {
    const index = bs(this._times, ticks, (a, b) => a - b)
    this._times.splice(index, 1)
  }

  update (oldTicks, ticks) {
    const index = bs(this._times, oldTicks, (a, b) => a - b)
    this._times.splice(index, 1)
    binarySearchInsert(this._times, (a, b) => { return a - b }, ticks)
    let oldestMessage = this._messages[0]
    const oldestTime = this._times[0]

    while (oldestMessage && oldestMessage._fromTicks < oldestTime) {
      const message = this._messages.shift()
      this._processMessage(message)
      oldestMessage = this._messages[0]
    }
  }

  async _processMessage (message) {
    const to = message.funcRef.destId.id.toString('hex')
    let actor = this.actors.get(to) || this.drivers.get(to)
    if (!actor) {
      actor = await this.hypervisor.loadActor(message.funcRef.destId)
      this.actors.set(to, actor)
    }
    if (!actor.running) {
      this._idles = Promise.all([this._idles, new Promise((resolve, reject) => {
        actor.once('idle', resolve)
      })])
    }
    actor.queue(message)
    // const numOfActorsRunning = [...this.actors].filter(actor => actor[1].running).length
    // console.log(numOfActorsRunning)
  }
}
