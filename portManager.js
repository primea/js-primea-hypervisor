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
  if (portA.ticks !== portB.ticks) {
    return portA.ticks < portB.ticks ? pairA : pairB
  } else if (a.priority !== b.priority) {
    // decide by priority
    return a.priority > b.priority ? pairA : pairB
  } else {
    // insertion order
    return pairA
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
    this._portMap = new Map()
  }

  /**
   * starts the port manager. This fetchs the ports from the state and maps
   * them to thier names
   * @returns {Promise}
   */
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

  /**
   * binds a port to a name
   * @param {Object} port - the port to bind
   * @param {String} name - the name of the port
   */
  bind (port, name) {
    // save the port instance
    this.ports[name] = port
    this._bindRef(port, name)
  }

  /**
   * queues a message on a port
   * @param {Message} message
   */
  queue (message) {
    this._portMap.get(message.fromPort).queue(message)
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
   * deletes a port given its name
   * @param {String} name
   * @returns {boolean} whether or not the port was deleted
   */
  delete (name) {
    const port = this.ports[name]
    delete this.ports[name]
    return this._portMap.delete(port)
  }

  /**
   * check if a port object is still valid
   * @param {Object} port
   * @return {Boolean}
   */
  isBound (port) {
    return this._portMap.has(port)
  }

  _createPortObject (type, link) {
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
      'link': link
    }

    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state['/'].nonce = nonce.toArray()
    return portRef
  }

  /**
   * creates a new Port given the container type
   * @param {String} type
   * @param {*} data - the data to populate the initail state with
   * @returns {Object} the newly created port
   */
  create (type, data) {
    const Container = this.hypervisor._containerTypes[type]
    return this._createPortObject(type, {
      '/': Container.createState(data)
    })
  }

  /**
   * creates a copy of a port given a port referance
   * @param {Object} port - the port to copy
   */
  copy (port) {
    return this._createPortObject(port.type, port.link)
  }

  /**
   * waits till all ports have reached a threshold tick count
   * @param {Integer} threshold - the number of ticks to wait
   * @param {Object} fromPort - the port requesting the wait
   * @param {Array} ports - the ports to wait on
   * @returns {Promise}
   */
  wait (threshold, fromPort = this.entryPort, ports = [...this._portMap]) {
    // find the ports that have a smaller tick count then the threshold tick count
    const unkownPorts = ports.filter(([portRef, port]) => {
      return port.ticks < threshold && fromPort !== portRef
    })

    const promises = unkownPorts.map(async([portRef, port]) => {
      // update the port's tick count
      port.ticks = await this.hypervisor.wait(portRef, threshold, this.entryPort)
    })

    return Promise.all(promises)
  }

  /**
   * gets the next canonical message given the an array of ports to choose from
   * @param {Array} ports
   * @returns {Promise}
   */
  async getNextMessage (ports = [...this._portMap]) {
    if (ports.length) {
      // find the oldest message
      const ticks = ports.map(([name, port]) => {
        return port.size ? port.ticks : this.exoInterface.ticks
      }).reduce((ticksA, ticksB) => {
        return ticksA < ticksB ? ticksA : ticksB
      })

      await this.wait(ticks)
      const portMap = ports.reduce(messageArbiter)
      return portMap[1].dequeue()
    }
  }
}
