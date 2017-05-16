const Graph = require('ipld-graph-builder')
const Kernel = require('./kernel.js')

module.exports = class Hypervisor {
  constructor (opts) {
    this.graph = new Graph(opts.dag)
    this._vmInstances = new Map()
    this._VMs = {}
  }

  async getInstance (port, parentPort) {
    let kernel = this._vmInstances.get(port)
    if (!kernel) {
      kernel = await this.createInstance(port.type, port.link, port, parentPort)
      kernel.on('idle', () => {
        this._vmInstances.delete(port)
      })
    }
    return kernel
  }

  // given a port, wait untill its source contract has reached the threshold
  // tick count
  async wait (port, threshold, fromPort) {
    let kernel = this._vmInstances.get(port)
    if (kernel) {
      return kernel.wait(threshold, fromPort)
    } else {
      return threshold
    }
  }

  async createInstance (type, state, entryPort = null, parentPort) {
    const VM = this._VMs[type]

    if (!state) {
      state = {
        '/': VM.createState()
      }
    }

    // create a new kernel instance
    const kernel = new Kernel({
      entryPort: entryPort,
      parentPort: parentPort,
      hypervisor: this,
      state: state,
      VM: VM
    })

    // save the newly created instance
    this._vmInstances.set(entryPort, kernel)
    await kernel.start()
    return kernel
  }

  async createStateRoot (container, ticks) {
    await container.wait(ticks)
    return this.graph.flush(container.state)
  }

  registerContainer (type, vm) {
    this._VMs[type] = vm
  }
}
