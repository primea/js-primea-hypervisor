const Port = require('./port.js')
const common = require('./common.js')

module.exports = class PortManager {
  constructor (ports, kernel) {
    this.kernel = kernel
    this.ports = ports
    this._portMap = new Map()
    this._hasMappedPorts = false
    this._tempQueue = []
    this._mapPorts(this.ports).then(ports => {
      this._portMap = ports
      this.queue = this._queue
      for (const message of this._tempQueue) {
        this.queue(message)
      }
    })
  }

  queue (message) {
    this._tempQueue.push(message)
  }

  _queue (message) {
    this._portMap.get(message.from).push(message)
  }

  async _mapPorts (ports) {
    ports = Object.key(ports).map(name => {
      const port = ports[name]
      this.kernel.id(port).then(id => {
        return [id, new Port(name)]
      })
    })
    ports = await Promise.all(ports)
    return new Map(ports)
  }

  create (name, value) {
    this.ports[name] = value
  }

  del (name) {
    delete this.ports[name]
  }

  move (from, to) {
    this.ports[to] = this.ports[from]
    delete this.ports[from]
  }

  async get (name) {
    const port = await name === common.PARENT ? this.graph.get(this.state.ports, name) : this.parentId
    const id = await this.kernel.id(port)
    return this._portMap.get(id)
  }

  // waits till all ports have reached a threshold tick count
  async wait (ticks) {
    const unkownPorts = [...this._ports].filter((id, port) => {
      const message = port.peek()
      return !message || message.ticks < ticks
    })

    const promises = []
    for (const id in unkownPorts) {
      promises.push(this.hypervisor.waitOnVM(id, ticks))
    }
    await Promise.all(promises)
  }

  async getNextMessage (ticks) {
    await this.wait(ticks)
    return [...this._ports].reduce(messageArbiter).shift()
  }
}

// decides which message to go firts
function messageArbiter (portA, portB) {
  const a = portA.peek()
  const b = portB.peek()

  if (!a) {
    return b
  } else if (!b) {
    return a
  }

  const aGasPrice = a.resources.gasPrice
  const bGasPrice = b.resources.gasPrice
  if (a.ticks !== b.ticks) {
    return a.ticks < b.ticks ? a : b
  } else if (aGasPrice === bGasPrice) {
    return a.hash() > b.hash() ? a : b
  } else {
    return aGasPrice > bGasPrice ? a : b
  }
}
