const Graph = require('ipld-graph-builder')
const Kernel = require('./kernel.js')

module.exports = class Hypervisor {
  constructor (opts) {
    this._opts = {
      hypervisor: this,
      VMs: {}
    }

    this.graph = new Graph(opts.dag)
    delete opts.dag
    this._vmInstances = new Map()
    Object.assign(this._opts, opts)
  }

  async getInstance (port) {
    const id = await this.generateID(port)
    let kernel = this._vmInstances.get(id)
    if (!kernel) {
      // load the container from the state
      await this.graph.tree(port, 2)

      // create a new kernel instance
      const VM = this._opts.VMs[port.type]
      const opts = Object.assign({
        state: port.link,
        id: port.id,
        VM: VM
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
    const id = await this.generateID(port)
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

  createPort (type, payload = {}, id = {nonce: [0], parent: null}) {
    const VM = this._opts.VMs[type]
    return {
      'messages': [],
      'id': {
        '/': id
      },
      'type': type,
      'link': {
        '/': VM.createState(payload)
      }
    }
  }

  async createStateRoot (port, ticks) {
    await this.wait(port, ticks)
    return this.graph.flush(port)
  }

  generateID (port) {
    return this.graph.flush(port.id)
  }

  addVM (type, vm) {
    this._opts.VMs[type] = vm
  }
}
