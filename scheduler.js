const EventEmitter = require('events')
const binarySearchInsert = require('binary-search-insert')
// const bs = require('binary-search')

// decides which message to go first
function comparator (messageA, messageB) {
  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks > messageB._fromTicks
  } else {
    return Buffer.compare(messageA._fromId, messageB._fromId)
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
    this._state = 'idle'
  }

  queue (messages) {
    messages.forEach(msg => binarySearchInsert(this._messages, comparator, msg))
    if (this._state === 'idle') {
      this._state = 'running'
      this._messageLoop()
    }
  }

  async _messageLoop () {
    let waits = []
    while (this._messages.length) {
      const message = this._messages.shift()
      waits.push(this._processMessage(message))
      const oldestMessage = this._messages[0]
      if (!oldestMessage || oldestMessage._fromTicks !== message._fromTicks) {
        await Promise.all(waits)
        waits = []
      }
    }
    this._state = 'idle'
    const promises = []
    this.actors.forEach(actor => promises.push(actor.shutdown()))
    await Promise.all(promises)
    this.actors.clear()
    this.emit('idle')
  }

  // enable for concurrency
  update (oldTicks, ticks) {
    // const index = bs(this._times, oldTicks, (a, b) => a - b)
    // this._times.splice(index, 1)
    // binarySearchInsert(this._times, (a, b) => { return a - b }, ticks)
    // let oldestMessage = this._messages[0]
    // const oldestTime = this._times[0]
    // while (oldestMessage && oldestMessage._fromTicks < oldestTime) {
    //   const message = this._messages.shift()
    //   this._processMessage(message)
    //   oldestMessage = this._messages[0]
    // }
  }

  async _processMessage (message) {
    const to = message.funcRef.destId.toString('hex')
    let actor = this.actors.get(to)
    if (!actor) {
      actor = await this.hypervisor.loadActor(message.funcRef.destId)
      this.actors.set(to, actor)
    }
    const promise = new Promise((resolve, reject) => {
      message.on('done', resolve)
    })
    actor.queue(message)
    return promise
  }
}
