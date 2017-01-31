module.exports = class MessageQueue {
  constructor (kernel) {
    this.kernel = kernel
  }

  add (message) {
    this.currentMessage = message
    return this.kernel.run(message)
  }
}
