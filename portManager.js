const Port = require('./port.js')
const ENTRY = Symbol('entry')

// decides which message to go firts
function messageArbiter (pairA, pairB) {
  const a = pairA[1].peek()
  const b = pairB[1].peek()

  if (!a) {
    return pairB
  } else if (!b) {
    return pairA
  }

  const aGasPrice = a.resources.gasPrice
  const bGasPrice = b.resources.gasPrice
  if (a.ticks !== b.ticks) {
    return a.ticks < b.ticks ? pairA : pairB
  } else if (aGasPrice === bGasPrice) {
    return a.hash() > b.hash() ? pairA : pairB
  } else {
    return aGasPrice > bGasPrice ? pairA : pairB
  }
}

module.exports = class PortManager {
  constructor (opts) {
    Object.assign(this, opts)
    this._portMap = new Map()
  }

  async start () {
    // map ports to thier id's
    this.ports = await this.hypervisor.graph.get(this.state, 'ports')
    Object.keys(this.ports).map(name => {
      const port = this.ports[name]
      this._mapPort(name, port)
    })

    // skip the root, since it doesn't have a parent
    if (this.parentPort !== undefined) {
      this._portMap.set(this.parentPort, new Port(ENTRY))
    }
  }

  _mapPort (name, portRef) {
    const port = new Port(name)
    this._portMap.set(portRef, port)
  }

  queue (message) {
    this._portMap.get(message.fromPort).queue(message)
  }

  set (name, port) {
    this.ports[name] = port
    return this._mapPort(name, port)
  }

  get (port) {
    return this._portMap.get(port)
  }

  getRef (key) {
    if (key === ENTRY) {
      return this.entryPort
    } else {
      return this.ports[key]
    }
  }

  // waits till all ports have reached a threshold tick count
  wait (threshold, fromPort) {
    // find the ports that have a smaller tick count then the threshold tick count
    const unkownPorts = [...this._portMap].filter(([portRef, port]) => {
      return port.ticks < threshold && fromPort !== portRef
    })

    const promises = unkownPorts.map(async ([portRef, port]) => {
      // update the port's tick count
      port.ticks = await this.hypervisor.wait(portRef, threshold, this.entryPort)
    })
    return Promise.all(promises)
  }

  async getNextMessage () {
    await this.wait(this.kernel.ticks, this.entryPort)
    const portMap = [...this._portMap].reduce(messageArbiter)
    if (portMap) {
      return portMap[1].shift()
    }
  }
}
