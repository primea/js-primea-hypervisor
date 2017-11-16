const binarySearchInsert = require('binary-search-insert')

module.exports = class Inbox {
  /**
   * The port manager manages the the ports. This inculdes creation, deletion
   * fetching and waiting on ports
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.hypervisor
   * @param {Object} opts.exoInterface
   */
  constructor (opts) {
    this.actor = opts.actor
    this.hypervisor = opts.hypervisor
    this._queue = []
    this._awaitedTags = new Set()
    this._oldestMessagePromise = new Promise((resolve, reject) => {
      this._oldestMessageResolve = resolve
    })
  }

  /**
   * queues a message on a port
   * @param {Message} message
   */
  queue (message) {
    binarySearchInsert(this._queue, messageArbiter, message)
    this._queueWaitingTags(message)

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
   * @returns {Promise}
   */
  async getNextMessage (tags, timeout = Infinity) {
    let oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)

    if (this._waitingTags) {
      throw new Error('already getting next message')
    }

    if (tags) {
      this._waitingTags = new Set(tags)
      this._queue.forEach(message => {
        this._queueWaitingTags(message)
      })
    }

    let message = this._getOldestMessage()
    let timeouted = false

    while (message && oldestTime <= message._fromTicks && !timeouted) {
      await Promise.race([
        this.hypervisor.scheduler.wait(message._fromTicks, this.actor.id).then(() => {
          timeouted = true
          message = this._getOldestMessage()
        }),
        this._olderMessage(message).then(m => {
          message = m
        })
      ])
      oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)
    }

    if (this._waitingTags) {
      message = this._waitingTagsQueue.shift()
    } else {
      message = this._queue.shift()
    }

    this._waitingTagsQueue = []
    delete this._waitingTags

    return message
  }

  // returns a promise that resolve when a message older then the given message
  // is recived
  _olderMessage (message) {
    return this._oldestMessagePromise
  }

  _getOldestMessage () {
    if (this._waitingTags) {
      return this._waitingTagsQueue[0]
    } else {
      return this._queue[0]
    }
  }

  _queueWaitingTags (message) {
    if (this._waitingTags && this._waitingTags.has(message.tag)) {
      this._waitingAddresses.delete(message.tag)
      binarySearchInsert(this._waitingAddressesQueue, messageArbiter, message)
    }
  }
}

// decides which message to go first
function messageArbiter (messageA, messageB) {
  if (!messageA) {
    return messageB
  } else if (!messageB) {
    return messageA
  }

  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks < messageB._fromTicks ? messageA : messageB
  } else {
    // insertion order
    return messageA
  }
}
