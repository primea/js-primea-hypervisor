const binarySearchInsert = require('binary-search-insert')
const Buffer = require('safe-buffer').Buffer

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
    this._waitingTagsQueue = []
    this._oldestMessagePromise = new Promise((resolve, reject) => {
      this._oldestMessageResolve = resolve
    })
  }

  /**
   * queues a message on a port
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

  async waitOnTag (tags, timeout) {
    if (this._waitingTags) {
      throw new Error('already getting next message')
    }

    this._waitingTags = new Set(tags)
    this._queue.forEach(message => this._queueMessage(message))

    const message = await this.getNextMessage(timeout)
    this._waitingTagsQueue.forEach(message => this._queueMessage(message))

    delete this._waitingTags
    return message
  }

  /**
   * Waits for the the next message if any
   * @returns {Promise}
   */
  async getNextMessage (timeout = 0) {
    let message = this._getOldestMessage()
    if (message === undefined && timeout === 0) {
      return
    }

    let oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)
    timeout += this.actor.ticks

    while (true) {
      if (message && message._fromTicks < timeout) {
        timeout = message._fromTicks
      }

      if (oldestTime >= timeout) {
        break
      }

      await Promise.race([
        this.hypervisor.scheduler.wait(timeout, this.actor.id).then(() => {
          message = this._getOldestMessage()
        }),
        this._olderMessage(message).then(m => {
          message = m
        })
      ])
      oldestTime = this.hypervisor.scheduler.leastNumberOfTicks(this.actor.id)
    }
    return this._deQueueMessage()
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

  _deQueueMessage () {
    if (this._waitingTags) {
      return this._waitingTagsQueue.shift()
    } else {
      return this._queue.shift()
    }
  }

  _queueMessage (message) {
    if (this._waitingTags && this._waitingTags.has(message.tag)) {
      this._waitingTags.delete(message.tag)
      binarySearchInsert(this._waitingTagsQueue, messageArbiter, message)
    } else {
      binarySearchInsert(this._queue, messageArbiter, message)
    }
  }
}

// decides which message to go first
function messageArbiter (messageA, messageB) {
  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks > messageB._fromTicks
  } else {
    // sender id
    return Buffer.compare(messageA._fromId, messageB._fromId)
  }
}
