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
    this._queue = []
    this._awaitedAddresses = new Set()
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

    if (this._waitingAddresses && this._waitingAddresses.has(message.fromAddress)) {
      this._waitingAddresses.delete(message.fromAddress)
      binarySearchInsert(this._waitingAddressesQueue, messageArbiter, message)
    }

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
  async getNextMessage (addresses, timeout = Infinity) {
    let oldestTime = this.hypervisor.scheduler.leastNumberOfTicks()

    if (Object.keys(this._waitingAdresses).length) {
      throw new Error('already getting next message')
    }

    if (addresses) {
      this._waitingAddresses = new Set(addresses)
    }

    let message = this._getOldestMessage()

    while (// end if we have a message older then slowest containers
      !((message && oldestTime >= message._fromTicks) ||
        // end if there are no messages and this container is the oldest contaner
        (!message && oldestTime === this.kernel.ticks))) {
      let ticksToWait = message ? message._fromTicks : this.kernel.ticks
      await Promise.race([
        this.hypervisor.scheduler.wait(ticksToWait, this.id).then(() => {
          message = this._getOldestMessage()
        }),
        this._olderMessage(message).then(m => {
          message = m
        })
      ])
      oldestTime = this.hypervisor.scheduler.leastNumberOfTicks()
    }

    this._waitingAddressesQueue = []
    delete this._waitingAddresses

    return message
  }

  // returns a promise that resolve when a message older then the given message
  // is recived
  _olderMessage (message) {
    return this._oldestMessagePromise
  }

  _getOldestMessage () {
    if (this._waitingAddresses) {
      return this._waitingAddressesQueue[0]
    } else {
      return this._queue[0]
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
