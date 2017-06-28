const BN = require('bn.js')
const DeleteMessage = require('./deleteMessage')

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
   * @param {Object} opts.hypervisor
   * @param {Object} opts.exoInterface
   */
  constructor (opts) {
    Object.assign(this, opts)
    this.ports = this.state.ports
    // tracks unbounded ports that we have
    this._unboundPorts = new Set()
    this._saturationPromise = new Promise((resolve, reject) => {
      this._saturationResolve = resolve
    })
    this._oldestMessagePromise = new Promise((resolve, reject) => {
      this._oldestMessageResolve = resolve
    })
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

      port.messages.forEach(message => {
        message._fromPort = port
        message.fromName = name
      })

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
   * @param {string} name
   * @returns {Promise}
   */
  async unbind (name) {
    const port = this.ports[name]
    delete this.ports[name]
    this._unboundPorts.add(port)
    this.hypervisor.addNodeToCheck(this.id)

    // update the destination port
    const destPort = await this.hypervisor.getDestPort(port)
    delete destPort.destName
    delete destPort.destId
    destPort.destPort = port
    return port
  }

  /**
   * delete an port given the name it is bound to
   * @param {string} name
   */
  delete (name) {
    const port = this.ports[name]
    this.exInterface.send(port, new DeleteMessage())
    this._delete(name)
  }

  _delete (name) {
    this.hypervisor.addNodeToCheck(this.id)
    delete this.ports[name]
  }

  /**
   * clears any unbounded ports referances
   */
  clearUnboundedPorts () {
    this._unboundPorts.forEach(port => {
      this.exInterface.send(port, new DeleteMessage())
    })
    this._unboundPorts.clear()
    if (Object.keys(this.ports).length === 0) {
      this.hypervisor.addNodeToCheck(this.id)
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
    const port = this.ports[name]

    message._fromPort = port
    message.fromName = name

    if (port.messages.push(message) === 1) {
      if (this._isSaturated()) {
        this._saturationResolve()
        this._saturationPromise = new Promise((resolve, reject) => {
          this._saturationResolve = resolve
        })
      }

      if (message._fromTicks < this._messageTickThreshold) {
        this._oldestMessageResolve(message)
        this._oldestMessagePromise = new Promise((resolve, reject) => {
          this._oldestMessageResolve = resolve
        })
        this._messageTickThreshold = Infinity
      }
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
   * creates a new container. Returning a port to it.
   * @param {String} type
   * @param {*} data - the data to populate the initail state with
   * @returns {Object}
   */
  create (type, data) {
    let nonce = this.state.nonce

    const id = {
      nonce: nonce,
      parent: this.id
    }

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state.nonce = nonce.toArray()

    // create a new channel for the container
    const ports = this.createChannel()
    this._unboundPorts.delete(ports[1])
    this.hypervisor.createInstance(type, data, [ports[1]], id)

    return ports[0]
  }

  /**
   * creates a channel returns the created ports in an Array
   * @returns {array}
   */
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

  // find and returns the next message
  _peekNextMessage () {
    const names = Object.keys(this.ports)
    if (names.length) {
      const portName = names.reduce(messageArbiter.bind(this))
      const port = this.ports[portName]
      return port.messages[0]
    }
  }

  /**
   * Waits for the the next message if any
   * @returns {Promise}
   */
  async getNextMessage () {
    let message = this._peekNextMessage()
    let saturated = this._isSaturated()
    let oldestTime = this.hypervisor.scheduler.oldest()

    while (!saturated && // end if there are messages on all the ports
      // end if we have a message older then slowest containers
      !((message && oldestTime >= message._fromTicks) ||
        // end if there are no messages and this container is the oldest contaner
        (!message && oldestTime === this.exInterface.ticks))) {
      const ticksToWait = message ? message._fromTicks : this.exInterface.ticks

      await Promise.race([
        this.hypervisor.scheduler.wait(ticksToWait, this.id).then(() => {
          message = this._peekNextMessage()
        }),
        this._olderMessage(message).then(m => {
          message = m
        }),
        this._whenSaturated().then(() => {
          saturated = true
          message = this._peekNextMessage()
        })
      ])

      oldestTime = this.hypervisor.scheduler.oldest()
    }
    return message
  }

  // tests wether or not all the ports have a message
  _isSaturated () {
    const keys = Object.keys(this.ports)
    return keys.length ? keys.every(name => this.ports[name].messages.length) : 0
  }

  // returns a promise that resolve when the ports are saturated
  _whenSaturated () {
    return this._saturationPromise
  }

  // returns a promise that resolve when a message older then the given message
  // is recived
  _olderMessage (message) {
    this._messageTickThreshold = message ? message._fromTicks : 0
    return this._oldestMessagePromise
  }
}
