const PriorityQueue = require('fastpriorityqueue')
const EventEmitter = require('events')
const BN = require('bn.js')
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
    this._waitingQueue = new PriorityQueue((a, b) => {
      return a.threshold > b.threshold
    })
    this.on('result', this._runNextMessage)
    this.on('idle', () => {
      while (!this._waitingQueue.isEmpty()) {
        const waiter = this._waitingQueue.poll()
        this.wait(waiter.ticks, waiter.from).then(ticks => {
          waiter.resolve(ticks)
        })
      }
    })
  }

  start () {
    return this.ports.start()
  }

  queue (message) {
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
    console.log('run next message')
    try {
      const message = await this.ports.getNextMessage()
      // if the vm is paused and it gets a message; save that message for use when the VM is resumed
      if (message && this.vmState === 'paused') {
        this.ports._portMap(message._fromPort).unshfit(message)
      } else if (!message && this.vmState !== 'paused') {
        // if no more messages then shut down
        this._updateVmState('idle')
      } else {
        // run the next message
        this._run(message)
      }
    } catch (e) {
      console.log(e)
    }
  }

  _updateEntryPort (entryPort) {
    // reset waits, update parent port
  }

  destroy () {
    // destory waits
  }

  pause () {
    this._setState('paused')
  }

  resume () {
    this._setState('running')
    this._runNextMessage()
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async _run (message) {
    // shallow copy
    const oldState = Object.assign({}, this.state)
    let result
    try {
      result = await this.vm.run(message) || {}
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
      clearObject(this.state)
      Object.assign(this.state, oldState)
      console.log(e)
    }

    this.emit('result', result)
    return result
  }

  // returns a promise that resolves once the kernel hits the threshould tick
  // count
  async wait (threshold, fromPort) {
    if (threshold <= this.ticks) {
      return this.ticks
    } else if (this.vmState === 'idle') {
      return this.ports.wait(threshold, fromPort)
    } else {
      return new Promise((resolve, reject) => {
        this._waitingQueue.add({
          threshold: threshold,
          resolve: resolve,
          from: fromPort
        })
      })
    }
  }

  incrementTicks (count) {
    this.ticks += count
    while (!this._waitingQueue.isEmpty()) {
      const waiter = this._waitingQueue.peek()
      if (waiter.threshold > this.ticks) {
        break
      } else {
        this._waitingQueue.poll().resolve(this.ticks)
      }
    }
  }

  async createPort (type, name) {
    const VM = this.hypervisor._VMs[type]
    const parentId = this.entryPort ? this.entryPort.id : null
    let nonce = await this.hypervisor.graph.get(this.state, 'nonce')
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
    await this.ports.set(name, portRef)
    // incerment the nonce
    nonce = new BN(nonce)
    nonce.iaddn(1)
    this.state['/'].nonce = nonce.toArray()
    return portRef
  }

  async send (portRef, message) {
    try {
      const portInstance = await this.ports.get(portRef)
      portInstance.hasSent = true
    } catch (e) {
      throw new Error('invalid port referance, which means the port that the port was either moved or destoried')
    }

    const id = await this.hypervisor.generateID(this.entryPort)
    message._fromPort = id
    message._ticks = this.ticks

    const receiverEntryPort = portRef === this.entryPort ? this.parentPort : portRef
    const vm = await this.hypervisor.getInstance(receiverEntryPort)
    vm.queue(message)
  }
}

function clearObject (myObject) {
  for (var member in myObject) {
    delete myObject[member]
  }
}
