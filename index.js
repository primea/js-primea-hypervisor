const Graph = require('ipld-graph-builder')
const Kernel = require('./kernel.js')

module.exports = class Hypervisor {
  constructor (dag) {
    this.graph = new Graph(dag)
    this._runningContainers = new Map()
    this._containerTypes = {}
  }

  /**
   * get a contrainer instance given the connecting port
   */
  async getInstance (port, parentPort) {
    let kernel = this._runningContainers.get(port)
    if (!kernel) {
      kernel = await this.createInstance(port.type, port.link, port, parentPort)
      kernel.on('idle', () => {
        this._runningContainers.delete(port)
      })
    }
    return kernel
  }

  // given a port, wait untill its source contract has reached the threshold
  // tick count
  async wait (port, threshold, fromPort) {
    let kernel = this._runningContainers.get(port)
    if (kernel) {
      return kernel.wait(threshold, fromPort)
    } else {
      return threshold
    }
  }

  async createInstance (type, state, entryPort = null, parentPort) {
    const Container = this._containerTypes[type]

    if (!state) {
      state = {
        '/': Container.createState()
      }
    }

    // create a new kernel instance
    const kernel = new Kernel({
      entryPort: entryPort,
      parentPort: parentPort,
      hypervisor: this,
      state: state,
      Container: Container
    })

    // save the newly created instance
    this._runningContainers.set(entryPort, kernel)
    await kernel.start()
    return kernel
  }

  async createStateRoot (container, ticks) {
    await container.wait(ticks)
    return this.graph.flush(container.state)
  }

  registerContainer (type, vm) {
    this._containerTypes[type] = vm
  }
}
