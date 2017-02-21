module.exports = class MessageQueue {
  constructor (kernel) {
    this._queue = []
  }

  add (message) {
    this.currentMessage = message
    return this.kernel.run(message)
  }

}
