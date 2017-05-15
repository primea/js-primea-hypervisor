const clearObject = require('object-clear')
const clone = require('clone')
const EventEmitter = require('events')
const PortManager = require('./portManager.js')

module.exports = class Kernel extends EventEmitter {
  constructor (opts) {
    super()
    this.state = opts.state
    this.entryPort = opts.entryPort
    this.hypervisor = opts.hypervisor

    this.vmState = 'idle'
    this.ticks = 0

    // create the port manager
    this.ports = new PortManager({
      kernel: this,
      hypervisor: opts.hypervisor,
      state: opts.state,
      entryPort: opts.entryPort,
      parentPort: opts.parentPort
    })

    this.vm = new opts.VM(this)
    this._waitingMap = new Map()

    this.on('result', this._runNextMessage)
    this.on('idle', () => {
      for (const [, waiter] of this._waitingMap) {
        waiter.resolve(this.ticks)
      }
    })
  }

  start () {
    return this.ports.start()
  }

  queue (message) {
    message._hops++
    this.ports.queue(message)
    if (this.vmState !== 'running') {
      this._updateVmState('running')
      this._runNextMessage()
    }
  }

  _updateVmState (vmState, message) {
    this.vmState = vmState
    this.emit(vmState, message)
  }

  async _runNextMessage () {
    const message = await this.ports.getNextMessage()
    if (message) {
      // run the next message
      this.run(message)
    } else {
      // if no more messages then shut down
      this._updateVmState('idle')
    }
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message) {
    const oldState = clone(this.state, false, 3)
    let result
    try {
      result = await this.vm.run(message) || {}
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

  // returns a promise that resolves once the kernel hits the threshould tick
  // count
  wait (threshold, fromPort) {
    if (threshold <= this.ticks) {
      return this.ticks
    } else if (this.vmState === 'idle') {
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

  incrementTicks (count) {
    this.ticks += count
    for (const [fromPort, waiter] of this._waitingMap) {
      if (waiter.threshold < this.ticks) {
        this._waitingMap.delete(fromPort)
        waiter.resolve(this.ticks)
      }
    }
  }

  async send (portRef, message) {
    message._fromPort = this.entryPort
    message._fromPortTicks = this.ticks

    const vm = await this.hypervisor.getInstance(portRef)
    vm.queue(message)

    const waiter = this._waitingMap.get(portRef)
    if (waiter) {
      waiter.resolve(this.ticks)
      this._waitingMap.delete(portRef)
    }
  }
}
