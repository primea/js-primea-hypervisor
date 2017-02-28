const EventEmitter = require('events')
const Port = require('./port.js')
const common = require('./common.js')

module.exports = class PortManager extends EventEmitter {
  constructor (state, destParentPort, KernelContructor) {
    super()
    this._queue = []
    this.state = state
    this.Kernel = KernelContructor
    // set up the parent port
    const parentPort = new Port(common.PARENT)
    parentPort.on('message', message => {
      this._recieveMessage(message)
    })

    // create the cache
    this.cache = new Map()
    this.cache.set(common.PARENT, parentPort)
  }

  _recieveMessage (message) {
    const index = this._queue.push(message) - 1
    this.emit('message', index)
  }

  async get (name) {
    console.log(name)
    let port = this.cache.get(name)
    if (!port) {
      port = new Port(name)
      port.on('message', message => {
        this._recieveMessage(message)
      })
      // create destination kernel
      const state = await this.state.get(name)
      const destKernel = new this.Kernel({
        state: state,
        parent: port
      })

      // shutdown the kernel when it is done doing it work
      destKernel.on('idle', () => {
        destKernel.shutdown()
        this.cache.delete(name)
      })

      // find and connect the destination port
      const destPort = await destKernel.ports.get(common.PARENT)
      port.connect(destPort)
      this.cache.set(name, port)
    }
    return port
  }

  async peek (index = 0) {
    return this._queue[index]
  }

  remove (index) {
    return this._queue.splice(index, index + 1)
  }

  close () {
    for (let port in this.cache) {
      port.emit('close')
    }
    this.cache.clear()
  }
}
