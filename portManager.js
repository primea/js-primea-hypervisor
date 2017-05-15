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

  if (a._fromPortTicks !== b._fromPortTicks) {
    return a._fromPortTicks < b._fromPortTicks ? pairA : pairB
  } else if (a.priority !== b.priority) {
    // decide by priority
    return a.priority > b.priority ? pairA : pairB
  } else if (portA.name === ENTRY) {
    return pairA
  } else {
    return portA.name < portB.name ? pairA : pairB
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
      this._portMap.set(this.parentPort, new Port(ENTRY))
    }
    // map ports to thier id's
    this.ports = await this.hypervisor.graph.get(this.state, 'ports')
    Object.keys(this.ports).map(name => {
      const port = this.ports[name]
      this._mapPort(name, port)
    })
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

  get (key) {
    return this.ports[key]
  }

  create (type, name) {
    const VM = this.hypervisor._VMs[type]
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
        '/': VM.createState()
      }
    }

    // create the port instance
    this.set(name, portRef)
    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state['/'].nonce = nonce.toArray()
    return portRef
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
    return portMap[1].shift()
  }
}
