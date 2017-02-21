const EventEmitter = require('events')
const Port = require('./port.js')
const common = require('./common.js')

module.exports = class PortManager extends EventEmitter {
  constructor (state, destParentPort, KernelContructor) {
    super()
    this.state = state
    this.sentMessage = []
    this.Kernel = KernelContructor
    // set up the parent port
    const parentPort = new Port()
    parentPort.on('message', message => {
      this.emit('message', message)
    })
    // create the cache
    this.cache = new Map()
    this.cache.set(common.PARENT, parentPort)
  }

  async get (name) {
    let port = this.cache.get(name)
    if (!port) {
      port = new Port()
      port.on('message', message => {
        this.emit('message', message)
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

  // dequeues the first message that is waiting on a port
  async dequeue () {
    // clear the outbox
    this.sentMessage = []
    for (let port in this.cache) {
      const message = port.dequeue()
      if (message) {
        return message
      }
    }
  }

  close () {
    for (let port in this.cache) {
      port.emit('close')
    }
    this.cache.clear()
  }
}
