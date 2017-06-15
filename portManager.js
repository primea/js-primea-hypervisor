const BN = require('bn.js')

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
  if (a._fromPortTicks !== b._fromPortTicks) {
    return a._fromPortTicks < b._fromPortTicks ? nameA : nameB
  } else if (a.priority !== b.priority) {
    // decide by priority
    return a.priority > b.priority ? nameA : nameB
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
    this._unboundPort = new WeakSet()
    this._waitingPorts = {}
  }

  /**
   * binds a port to a name
   * @param {Object} port - the port to bind
   * @param {String} name - the name of the port
   */
  async bind (port, name) {
    if (this.isBound(port)) {
      throw new Error('cannot bind a port that is already bound')
    } else if (this.ports[name]) {
      throw new Error('cannot bind port to a name that is alread bound')
    }

    let destPort = port.destPort
    // if the dest is unbound
    if (destPort) {
      delete destPort.destPort
    } else {
      destPort = await this.hypervisor.getPort(port)
    }

    destPort.destName = name
    destPort.destId = this.id

    // save the port instance
    this.ports[name] = port
  }

  /**
   * unbinds a port given its name
   * @param {String} name
   * @returns {boolean} whether or not the port was deleted
   */
  async unbind (name, del) {
    const port = this.ports[name]
    delete this.ports[name]

    let destPort = port.destPort
    // if the dest is unbound
    if (destPort) {
      delete destPort.destName
      delete destPort.destId
    } else {
      destPort = await this.hypervisor.getPort(port)
    }
    if (del) {
      delete destPort.destPort
    } else {
      destPort.destPort = port
      return port
    }
  }

  /**
   * check if a port object is still valid
   * @param {Object} port
   * @return {Boolean}
   */
  isBound (port) {
    return !this._unboundPort.has(port)
  }

  /**
   * queues a message on a port
   * @param {Message} message
   */
  queue (name, message) {
    const resolve = this._waitingPorts[name]
    if (resolve) {
      resolve(message)
    } else {
      this.ports[name].push(message)
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
  async create (type, data) {
    // const container = this.hypervisor._containerTypes[type]
    let nonce = this.state['/'].nonce

    const entryPort = {
      messages: []
    }

    const port = {
      messages: [],
      destPort: entryPort
    }

    entryPort.destPort = port

    const id = await this.getIdHash({
      nonce: nonce,
      parent: this.id
    })

    await this.hypervisor.createInstance(id, type, data, entryPort)

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state['/'].nonce = nonce.toArray()
    this._unboundPort.add(port)
    return port
  }

  /**
   * waits till all ports have reached a threshold tick count
   * @param {Integer} threshold - the number of ticks to wait
   * @param {Object} fromPort - the port requesting the wait
   * @param {Array} ports - the ports to wait on
   * @returns {Promise}
   */
  wait (ticks, port) {
    if (this._waitingPorts[port]) {
      throw new Error('cannot wait on port that already has a wait on it')
    }
    const message = this.ports[port].message.shift()
    if (message) {
      return message
    } else {
      const waitPromise = this.hypervisor.scheduler.wait(ticks)
      const promise = new Promise((resolve, reject) => {
        this._waitingPorts[port] = resolve
      })

      return Promise.race([waitPromise, promise])
    }
  }

  /**
   * gets the next canonical message given the an array of ports to choose from
   * @param {Array} ports
   * @returns {Promise}
   */
  nextMessage () {
    const portName = Object.keys(this.ports).reduce(messageArbiter)
    return this.ports[portName].message.shift()
  }

  hasMessage () {
    return Object.keys(this.ports).some(name => this.ports[name].message.length)
  }

  async getIdHash (idObj) {
    return (await this.graph.flush(idObj))['/']
  }
}
