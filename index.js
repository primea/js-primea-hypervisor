const Graph = require('ipld-graph-builder')
const multibase = require('multibase')
const Kernel = require('./kernel.js')

class Root {
  queue () {
    console.log('root queued!')
  }
}

module.exports = class Hypervisor {
  constructor (opts) {
    this._opts = {
      VMs: {}
    }

    this.graph = new Graph(opts.dag)
    delete opts.dag
    this.root = new Root()
    this._vmInstances = new Map([[null, new Root()]])
    Object.assign(this._opts, opts)
  }

  async getInstance (port) {
    let id = await this.generateID(port)
    let kernel = this._vmInstances.get(id)
    if (!kernel) {
      // load the container from the state
      await this.graph.tree(port, 2)

      // create a new kernel instance
      const VM = this._opts.VMs[port.type]

      kernel = new Kernel({
        parentPort: port,
        hypervisor: this,
        VM: VM
      })

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
  async wait (port, threshold) {
    let kernel = await this.getInstance(port)
    return kernel.wait(threshold)
  }

  createPort (type, id = {nonce: [0], parent: null}) {
    const VM = this._opts.VMs[type]
    return {
      'messages': [],
      'id': {
        '/': id
      },
      'type': type,
      'link': {
        '/': VM.createState()
      }
    }
  }

  async createStateRoot (port, ticks) {
    await this.wait(port, ticks)
    return this.graph.flush(port)
  }

  async generateID (port) {
    // root id
    if (!port) {
      return null
    }

    let id = await this.graph.flush(port.id)
    id = id['/']
    if (Buffer.isBuffer(id)) {
      id = multibase.encode('base58btc', id).toString()
    }
    return id
  }

  addVM (type, vm) {
    this._opts.VMs[type] = vm
  }
}
