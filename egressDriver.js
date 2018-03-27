const {ID} = require('./systemObjects')
const EventEmitter = require('events')

module.exports = class Egress extends EventEmitter {
  constructor () {
    super()
    this.id = new ID(Buffer.from([0]))
  }

  queue (message) {
    this.runMessage(message)
  }

  runMessage (message) {
    this.emit('message', message)
  }
}
