const binarySearchInsert = require('binary-search-insert')
const Scheduler = require('./index.js')

// decides which message to go first
function comparator (messageA, messageB) {
  // order by number of ticks if messages have different number of ticks
  if (messageA._fromTicks !== messageB._fromTicks) {
    return messageA._fromTicks > messageB._fromTicks
  } else {
    return Buffer.compare(messageA._fromId.id, messageB._fromId.id)
  }
}

/**
 * This Scheduler impose ordering by how much gas was spent by the contract
 * sending the message
 */
module.exports = class OrderedScheduler extends Scheduler {
  queue (messages) {
    messages.forEach(msg => binarySearchInsert(this._messages, comparator, msg))
    if (!this._running) {
      this._running = true
      this._messageLoop()
    }
  }
}
