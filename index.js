const Graph = require('ipld-graph-builder')
const Kernel = require('./kernel.js')
const crypto = require('./crypto')

module.exports = class Hypervisor {
  constructor (opts) {
    this._opts = {
      hypervisor: this,
      VMs: {}
    }

    this.graph = new Graph(opts.dag)
    this._vmInstances = new Map()
    Object.assign(this._opts, opts)
  }

  async getInstance (port) {
    const id = await this.generateID(port.id)
    let kernel = this._vmInstances.get(id)
    if (!kernel) {
      // load the container from the state
      await this.graph.tree(port, 2)

      // create a new kernel instance
      const opts = Object.assign({
        state: port.vm,
        id: port.id
      }, this._opts)

      kernel = new Kernel(opts)
      await kernel.start()
      kernel.on('idle', () => {
        this._vmInstances.delete(id)
      })
      this._vmInstances.set(id, kernel)
    }
    return kernel
  }

  async send (port, message) {
    const vm = await this.getInstance(port)
    const id = await this.generateID(port.id)
    message._fromPort = id
    vm.queue(message)
  }

  // given a port, wait untill its source contract has reached the threshold
  // tick count
  async wait (port, ticks) {
    let kernel = await this.getInstance(port)
    await kernel.wait(ticks)
    return kernel
  }

  async createStateRoot (port, ticks) {
    const kernel = await this.wait(port, ticks)
    return this.graph.flush(kernel.state)
  }

  async generateID (port) {
    let id = Buffer.concat([port.nonce, port.parent])
    id = await crypto.subtle.digest('SHA-256', id)
    return new Buffer(id).toString('hex')
  }

  addVM (type, vm) {
    this._opts.VMs[type] = vm
  }
}
