const BN = require('bn.js')
const Message = require('primea-message')

// decides which message to go first
function messageArbiter (nameA, nameB) {
  const a = this.ports[nameA].messages[0]
  const b = this.ports[nameB].messages[0]

  if (!a) {
    return nameB
  } else if (!b) {
    return nameA
  }

  // order by number of ticks if messages have different number of ticks
  if (a._fromTicks !== b._fromTicks) {
    return a._fromTicks < b._fromTicks ? nameA : nameB
  } else {
    // insertion order
    return nameA
  }
}

module.exports = class PortManager {
  /**
   * The port manager manages the the ports. This inculdes creation, deletion
   * fetching and waiting on ports
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.entryPort
   * @param {Object} opts.parentPort
   * @param {Object} opts.hypervisor
   * @param {Object} opts.exoInterface
   */
  constructor (opts) {
    Object.assign(this, opts)
    this.ports = this.state.ports
    this._unboundPorts = new Set()
    this._waitingPorts = {}
  }

  /**
   * binds a port to a name
   * @param {Object} port - the port to bind
   * @param {String} name - the name of the port
   */
  async bind (name, port) {
    if (this.isBound(port)) {
      throw new Error('cannot bind a port that is already bound')
    } else if (this.ports[name]) {
      throw new Error('cannot bind port to a name that is alread bound')
    } else {
      this._unboundPorts.delete(port)

      // save the port instance
      this.ports[name] = port

      // update the dest port
      const destPort = await this.hypervisor.getDestPort(port)
      destPort.destName = name
      destPort.destId = this.id
      delete destPort.destPort
    }
  }

  /**
   * unbinds a port given its name
   * @param {String} name
   * @returns {boolean} whether or not the port was deleted
   */
  async unbind (name) {
    const port = this.ports[name]
    delete this.ports[name]
    this._unboundPorts.add(port)

    let destPort = await this.hypervisor.getDestPort(port)

    delete destPort.destName
    delete destPort.destId
    destPort.destPort = port
    this.hypervisor._nodesToCheck.add(this.id)
    return port
  }

  delete (name) {
    const port = this.ports[name]
    this._delete(name)
    this.exInterface.send(port, new Message({
      data: 'delete'
    }))
  }

  _delete (name) {
    this.hypervisor._nodesToCheck.add(this.id)
    delete this.ports[name]
  }

  clearUnboundedPorts () {
    this._unboundPorts.forEach(port => {
      this.exInterface.send(port, new Message({
        data: 'delete'
      }))
    })
    this._unboundPorts.clear()
    if (Object.keys(this.ports).length === 0) {
      this.hypervisor.deleteInstance(this.id)
    }
  }

  /**
   * check if a port object is still valid
   * @param {Object} port
   * @return {Boolean}
   */
  isBound (port) {
    return !this._unboundPorts.has(port)
  }

  /**
   * queues a message on a port
   * @param {Message} message
   */
  queue (name, message) {
    if (name) {
      this.ports[name].messages.push(message)
    }
  }

  /**
   * gets a port given it's name
   * @param {String} name
   * @return {Object}
   */
  get (name) {
    return this.ports[name]
  }

  /**
   * creates a new Port given the container type
   * @param {String} type
   * @param {*} data - the data to populate the initail state with
   * @returns {Promise}
   */
  create (type, data) {
    // const container = this.hypervisor._containerTypes[type]
    let nonce = this.state.nonce

    const id = {
      nonce: nonce,
      parent: this.id
    }

    const ports = this.createChannel()
    this._unboundPorts.delete(ports[1])
    this.hypervisor.createInstance(type, data, [ports[1]], id)

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state.nonce = nonce.toArray()
    return ports[0]
  }

  createChannel () {
    const port1 = {
      messages: []
    }

    const port2 = {
      messages: [],
      destPort: port1
    }

    port1.destPort = port2
    this._unboundPorts.add(port1)
    this._unboundPorts.add(port2)
    return [port1, port2]
  }

  /**
   * gets the next canonical message given the an array of ports to choose from
   * @param {Array} ports
   * @returns {Promise}
   */
  nextMessage () {
    const message = this.peekNextMessage()
    message._fromPort.messages.shift()
    return message
  }

  peekNextMessage () {
    const portName = Object.keys(this.ports).reduce(messageArbiter.bind(this))
    const port = this.ports[portName]
    const message = port.messages[0]
    message._fromPort = port
    message.fromName = portName
    return message
  }

  hasMessages () {
    return Object.keys(this.ports).some(name => this.ports[name].messages.length)
  }

  isSaturated () {
    return Object.keys(this.ports).every(name => this.ports[name].messages.length)
  }
}
