const clearObject = require('object-clear')
const clone = require('clone')
const EventEmitter = require('events')
const PortManager = require('./portManager.js')

module.exports = class ExoInterface extends EventEmitter {
  /**
   * the ExoInterface manages the varous message passing functions and provides
   * an interface for the containers to use
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.entryPort
   * @param {Object} opts.parentPort
   * @param {Object} opts.hypervisor
   * @param {Object} opts.Container
   */
  constructor (opts) {
    super()
    this.state = opts.state
    this.entryPort = opts.entryPort
    this.hypervisor = opts.hypervisor

    this.containerState = 'idle'
    this.ticks = 0

    // create the port manager
    this.ports = new PortManager(Object.assign({
      exoInterface: this
    }, opts))

    this._waitingMap = new Map()
    this.container = new opts.Container(this)

    // once we get an result we run the next message
    this.on('result', this._runNextMessage)

    // on idle clear all the 'wiats'
    this.on('idle', () => {
      for (const [, waiter] of this._waitingMap) {
        waiter.resolve(this.ticks)
      }
    })
  }

  /**
   * starts the container
   * @returns {Promise}
   */
  start () {
    return this.ports.start()
  }

  /**
   * adds a message to this containers message queue
   * @param {Message} message
   */
  queue (message) {
    message._hops++
    this.ports.queue(message)
    if (this.containerState !== 'running') {
      this._updateContainerState('running')
      this._runNextMessage()
    }
  }

  _updateContainerState (containerState, message) {
    this.containerState = containerState
    this.emit(containerState, message)
  }

  async _runNextMessage () {
    const message = await this.ports.getNextMessage()
    if (message) {
      // run the next message
      this.run(message)
    } else {
      // if no more messages then shut down
      this._updateContainerState('idle')
    }
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   * @returns {Promise}
   */
  async run (message) {
    const oldState = clone(this.state, false, 3)
    let result
    try {
      result = await this.container.run(message) || {}
    } catch (e) {
      // revert the state
      clearObject(this.state)
      Object.assign(this.state, oldState)

      result = {
        exception: true,
        exceptionError: e
      }
    }

    this.emit('result', result)
    return result
  }

  /**
   * returns a promise that resolves once the kernel hits the threshould tick count
   * @param {Number} threshould - the number of ticks to wait
   * @returns {Promise}
   */
  wait (threshold, fromPort) {
    if (threshold <= this.ticks) {
      return this.ticks
    } else if (this.containerState === 'idle') {
      return this.ports.wait(threshold, fromPort)
    } else {
      return new Promise((resolve, reject) => {
        this._waitingMap.set(fromPort, {
          threshold: threshold,
          resolve: resolve,
          from: fromPort
        })
      })
    }
  }

  /**
   * updates the number of ticks that the container has run
   * @param {Number} count - the number of ticks to add
   */
  incrementTicks (count) {
    this.ticks += count
    for (const [fromPort, waiter] of this._waitingMap) {
      if (waiter.threshold < this.ticks) {
        this._waitingMap.delete(fromPort)
        waiter.resolve(this.ticks)
      }
    }
  }

  /**
   * sends a message to a given port
   * @param {Object} portRef - the port
   * @param {Message} message - the message
   */
  async send (portRef, message) {
    if (!this.ports.isValidPort(portRef)) {
      throw new Error('invalid port referance')
    }

    // set the port that the message came from
    message._fromPort = this.entryPort
    message._fromPortTicks = this.ticks

    const container = await this.getInstance(portRef)
    container.queue(message)

    const waiter = this._waitingMap.get(portRef)
    // if the was a wait on this port the resolve it
    if (waiter) {
      waiter.resolve(this.ticks)
      this._waitingMap.delete(portRef)
    }
  }

  /**
   * gets a container instance given a port
   * @param {Object} portRef - the port
   * @returns {Object}
   */
  getInstance (portRef) {
    return this.hypervisor.getInstanceByPort(portRef, this.entryPort)
  }
}
