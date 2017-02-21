const EventEmitter = require('events')

module.exports = class Port extends EventEmitter {
  constructor () {
    super()
    this.queue = []
  }

  connect (destPort) {
    this.destPort = destPort
    destPort.destPort = this
  }

  async send (message) {
    return this.destPort.recieve(message)
  }

  async recieve (message) {
    this.emit('message', message)
    this.queue.push(message)
  }

  dequeue () {
    return this.queue.unshift()
  }
}
