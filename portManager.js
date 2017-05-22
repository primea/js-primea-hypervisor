const Port = require('./port.js')
const BN = require('bn.js')
const ENTRY = Symbol('entry')

// decides which message to go first
function messageArbiter (pairA, pairB) {
  const portA = pairA[1]
  const portB = pairB[1]
  const a = portA.peek()
  const b = portB.peek()

  if (!a) {
    return pairB
  } else if (!b) {
    return pairA
  }

  // order by number of ticks if messages have different number of ticks
  if (a._fromPortTicks !== b._fromPortTicks) {
    return a._fromPortTicks < b._fromPortTicks ? pairA : pairB
  } else if (a.priority !== b.priority) {
    // decide by priority
    return a.priority > b.priority ? pairA : pairB
  } else {
    // insertion order
    return pairA
  }
}

module.exports = class PortManager {
  constructor (opts) {
    Object.assign(this, opts)
    this._portMap = new Map()
  }

  async start () {
    // skip the root, since it doesn't have a parent
    if (this.parentPort !== undefined) {
      this._bindRef(this.parentPort, ENTRY)
    }

    // map ports to thier id's
    this.ports = await this.hypervisor.graph.get(this.state, 'ports')
    Object.keys(this.ports).map(name => {
      const port = this.ports[name]
      this._bindRef(port, name)
    })
  }

  _bindRef (portRef, name) {
    const port = new Port(name)
    this._portMap.set(portRef, port)
  }

  bind (port, name) {
    // save the port instance
    this.ports[name] = port
    this._bindRef(port, name)
  }

  queue (message) {
    this._portMap.get(message.fromPort).queue(message)
  }

  get (key) {
    return this.ports[key]
  }

  delete (key) {
    const port = this.ports[key]
    delete this.ports[key]
    this._portMap.delete(port)
  }

  isValidPort (port) {
    return this._portMap.has(port)
  }

  create (type) {
    const Container = this.hypervisor._containerTypes[type]
    const parentId = this.entryPort ? this.entryPort.id : null
    let nonce = this.state['/'].nonce

    const portRef = {
      'messages': [],
      'id': {
        '/': {
          nonce: nonce,
          parent: parentId
        }
      },
      'type': type,
      'link': {
        '/': Container.createState()
      }
    }

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state['/'].nonce = nonce.toArray()
    return portRef
  }

  // waits till all ports have reached a threshold tick count
  wait (threshold, fromPort = this.entryPort, ports = this._portMap) {
    // find the ports that have a smaller tick count then the threshold tick count
    const unkownPorts = [...ports].filter(([portRef, port]) => {
      return port.ticks < threshold && fromPort !== portRef
    })

    const promises = unkownPorts.map(async([portRef, port]) => {
      // update the port's tick count
      port.ticks = await this.hypervisor.wait(portRef, threshold, this.entryPort)
    })

    return Promise.all(promises)
  }

  async getNextMessage () {
    if (this._portMap.size) {
      await this.wait(this.exoInterface.ticks)
      const portMap = [...this._portMap].reduce(messageArbiter)
      return portMap[1].shift()
    }
  }
}
