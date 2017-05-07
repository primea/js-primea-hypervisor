const Graph = require('ipld-graph-builder')
const multibase = require('multibase')
const Kernel = require('./kernel.js')

module.exports = class Hypervisor {
  constructor (opts) {
    this.graph = new Graph(opts.dag)
    this._vmInstances = new Map()
    this._VMs = {}
  }

  async getInstance (port) {
    let id = await this.generateID(port)
    let kernel = this._vmInstances.get(id)
    if (!kernel) {
      // load the container from the state
      await this.graph.tree(port, 2)
      const parentID = await this.generateID(port.id['/'].parent)
      const parentKernel = await this._vmInstances.get(parentID)
      const parentPort = parentKernel.entryPort || null

      kernel = await this.createInstanceFromPort(port, parentPort)
      // don't delete the root contracts
      if (id) {
        kernel.on('idle', () => {
          this._vmInstances.delete(id)
        })
      }
    }
    return kernel
  }

  // given a port, wait untill its source contract has reached the threshold
  // tick count
  async wait (port, threshold, fromPort) {
    let kernel = await this.getInstance(port)
    return kernel.wait(threshold, fromPort)
  }

  async createInstance (type, state, entryPort, parentPort) {
    const VM = this._VMs[type]
    if (!state) {
      state = VM.createState()
    }
    // create a new kernel instance
    const kernel = new Kernel({
      entryPort: entryPort,
      parentPort: parentPort,
      hypervisor: this,
      state: state,
      VM: VM
    })

    const id = await this.generateID(entryPort)
    this._vmInstances.set(id, kernel)
    await kernel.start()
    return kernel
  }

  /**
   * opts.entryPort
   * opts.parentPort
   */
  async createInstanceFromPort (entryPort, parentPort) {
    const state = entryPort.link['/']
    return this.createInstance(entryPort.type, state, entryPort, parentPort)
  }

  async createStateRoot (container, ticks) {
    await container.wait(ticks)
    return this.graph.flush(container.state)
  }

  async generateID (port) {
    if (!port || !port.id) {
      return null
    }
    let id = Object.assign({}, port.id)
    id = await this.graph.flush(id)
    id = id['/']
    if (Buffer.isBuffer(id)) {
      id = multibase.encode('base58btc', id).toString()
    }
    return id
  }

  registerContainer (type, vm) {
    this._VMs[type] = vm
  }
}
