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
    this.destPort.recieve(message)
  }

  async recieve (message) {
    message.from.push(this.name)
    this.emit('message', message)
  }
}
