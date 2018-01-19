const Buffer = require('safe-buffer').Buffer
const binarySearchInsert = require('binary-search-insert')

// decides which message to go first
function messageArbiter (messageA, messageB) {
  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks > messageB._fromTicks
  } else {
    // sender id
    // console.log('here')
    return Buffer.compare(messageA._fromId, messageB._fromId)
  }
}

module.exports = class Inbox {
  /**
   * The inbox manages and sorts incoming messages and provides functions
   * to wait on messages
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.hypervisor
   */
  constructor (opts) {
    this.actor = opts.actor
    this.hypervisor = opts.hypervisor
    this._queue = []
    this._oldestMessagePromise = new Promise((resolve, reject) => {
      this._oldestMessageResolve = resolve
    })
  }

  get isEmpty () {
    return !this._queue.length
  }

  /**
   * queues a message
   * @param {Message} message
   */
  queue (message) {
    this._queueMessage(message)

    const oldestMessage = this._getOldestMessage()
    if (oldestMessage === message) {
      this._oldestMessageResolve(message)
      this._oldestMessagePromise = new Promise((resolve, reject) => {
        this._oldestMessageResolve = resolve
      })
    }
  }

  /**
   * Waits for the the next message if any
   * @param {Integer} timeout
   * @returns {Promise}
   */
  async nextMessage () {
    let message = this._getOldestMessage()
    let timeout = message._fromTicks
    let oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)

    while (true) {
      // if all actors are "older" then the time out then stop waiting for messages
      // since we konw that we can not receive one
      if (oldestTime >= timeout) {
        break
      }

      await Promise.race([
        this.hypervisor.scheduler.wait(timeout, this.actor.id).then(() => {
          message = this._getOldestMessage()
        }),
        this._olderMessage(message).then(m => {
          message = m
          // if there is a message that is "older" then the timeout, the lower
          // the timeout to the oldest message
          timeout = message._fromTicks
        })
      ])
      oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)
    }
    message = this._deQueueMessage()
    // if the message we recived had more ticks then we currently have then
    // update our ticks to it, since we jumped forward in time
    if (message && message._fromTicks > this.actor.ticks) {
      this.actor.ticks = message._fromTicks
      this.hypervisor.scheduler.update(this.actor)
    }
    return message
  }

  // returns a promise that resolve when a message older then the given message
  // is recived
  _olderMessage (message) {
    return this._oldestMessagePromise
  }

  _getOldestMessage () {
    return this._queue[0]
  }

  _deQueueMessage () {
    return this._queue.shift()
  }

  _queueMessage (message) {
    binarySearchInsert(this._queue, messageArbiter, message)
  }
}
