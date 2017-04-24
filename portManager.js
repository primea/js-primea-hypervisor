const Port = require('./port.js')

module.exports = class PortManager {
  constructor (kernel) {
    this.kernel = kernel
    this.hypervisor = kernel._opts.hypervisor
    this.ports = kernel._opts.state.ports
    this._portMap = new Map()
  }

  async start () {
    // map ports to thier id's
    let ports = Object.keys(this.ports).map(name => {
      const port = this.ports[name]
      this.hypervisor.generateID(port).then(id => {
        return [id, new Port(name)]
      })
    })

    // create the parent port
    ports.push(this.hypervisor.generateID(this.kernel._opts.id).then(id => {
      return [id, new Port('parent')]
    }))
    ports = await Promise.all(ports)
    this._portMap = new Map(ports)
  }

  queue (message) {
    this._portMap.get(message.fromPort).queue(message)
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
    const port = await this.graph.get(this.state.ports, name)
    const id = await this.hypervisor.generateID(port)
    return this._portMap.get(id)
  }

  async getParent () {
    const id = await this.hypervisor.generateID(this.kernel._opts.id)
    return this._portMap.get(id)
  }

  // waits till all ports have reached a threshold tick count
  async wait (threshold) {
    // find the ports that have a smaller tick count then the threshold tick count
    const unkownPorts = [...this._ports].filter((id, port) => {
      const message = port.peek()
      return !message || message.ticks < threshold
    })

    const promises = unkownPorts.map(port => {
      this.hypervisor.wait(port, threshold).then(ticks => {
        // update the port's tick count
        port.ticks = ticks
      })
    })
    await Promise.all(promises)
  }

  async getNextMessage (ticks) {
    await this.wait(ticks)
    return [...this._portMap].reduce(messageArbiter).shift()
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
