const EventEmitter = require('events')

module.exports = class Port extends EventEmitter {
  constructor () {
    super()
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
  }
}
