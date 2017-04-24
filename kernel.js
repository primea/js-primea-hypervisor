const PriorityQueue = require('fastpriorityqueue')
const EventEmitter = require('events')
const BN = require('bn.js')
const PortManager = require('./portManager.js')

module.exports = class Kernel extends EventEmitter {
  constructor (opts) {
    super()
    this._opts = opts
    this.vmState = 'idle'
    this.ticks = 0
    this.ports = new PortManager(this)
    this.vm = new opts.VM(this)
    this._waitingQueue = new PriorityQueue((a, b) => {
      return a.threshold > b.threshold
    })
    this.on('result', this._runNextMessage)
  }

  start () {
    return this.ports.start()
  }

  _updateVmState (state, message) {
    this.vmState = state
    this.emit(this.vmState, message)
  }

  queue (message) {
    this.ports.queue(message)
    if (this.vmState === 'idle') {
      this._runNextMessage()
    }
  }

  _runNextMessage () {
    this.ports.getNextMessage(this.ticks).then(message => {
      if (message) {
        this.run(message)
      } else {
        this._updateVmState('idle', message)
      }
    })
  }

  /**
   * run the kernels code with a given enviroment
   * The Kernel Stores all of its state in the Environment. The Interface is used
   * to by the VM to retrive infromation from the Environment.
   */
  async run (message) {
    this._updateVmState('running', message)
    // shallow copy
    const oldState = Object.assign({}, this._opts.state)
    let result
    try {
      result = await this.vm.run(message) || {}
    } catch (e) {
      result = {
        exception: true,
        exceptionError: e
      }
    }

    if (result.exception) {
      // revert to the old state
      clearObject(this._opts.state)
      Object.assign(this._opts.state, oldState)
    }

    this._updateVmState('result', result)
    return result
  }

  // returns a promise that resolves once the kernel hits the threshould tick
  // count
  async wait (threshold) {
    if (this.vmState === 'idle' && threshold > this.ticks) {
      // the cotract is at idle so wait
      return this.ports.wait(threshold)
    } else {
      return new Promise((resolve, reject) => {
        if (threshold <= this.ticks) {
          resolve(this.ticks)
        } else {
          this._waitingQueue.add({
            threshold: threshold,
            resolve: resolve
          })
        }
      })
    }
  }

  _updateTickCount (count) {
    this.ticks = count
    while (this._waitingQueue.peek().threshold <= count) {
      this._waitingQueue.poll().resolve(count)
    }
  }

  createPort () {
    const nonce = new BN(this.nonce)
    nonce.iaddn(1)
    this.nonce = nonce.toArrayLike(Buffer)
    return {
      id: {
        '/': {
          nonce: this.nonce,
          parent: this.id
        }
      },
      link: {
        '/': {}
      }
    }
  }

  async send (port, message) {
    message._ticks = this.ticks
    return this._opts.hypervisor.send(port, message)
  }
}

function clearObject (myObject) {
  for (var member in myObject) {
    delete myObject[member]
  }
}
