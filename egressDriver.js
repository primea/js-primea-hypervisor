const {ID} = require('primea-objects')
const EventEmitter = require('events')

module.exports = class Egress extends EventEmitter {
  constructor () {
    super()
    this.id = new ID(Buffer.from([0]))
  }

  startup () {}

  runMessage (message) {
    this.emit('message', message)
  }
}
