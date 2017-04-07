const EventEmitter = require('events')

module.exports = class Port extends EventEmitter {
  constructor (name) {
    super()
    this.name = name
    this.connected = false
  }

  connect (destPort) {
    if (!this.connected) {
      this.destPort = destPort
      destPort.destPort = this
      this.connected = true
    }
  }

  async send (message) {
    message._hops++
    this.destPort.recieve(message)
  }

  recieve (message) {
    this.emit('message', message)
  }
}
