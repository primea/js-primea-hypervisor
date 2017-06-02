const Graph = require('ipld-graph-builder')
const ExoInterface = require('./exoInterface.js')

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Graph} dag an instance of [ipfs.dag](https://github.com/ipfs/interface-ipfs-core/tree/master/API/dag#dag-api)
   */
  constructor (dag) {
    this.graph = new Graph(dag)
    this._containerInstances = new Map()
    this._containerTypes = {}
  }

  /**
   * get a container by its path
   * @param {Object} root - the root container to start searching from
   * @param {String} path - the path to travers
   */
  async getInstanceByPath (root, path) {
    path = path.split('/')
    for (const name of path) {
      const portRef = root.ports.get(name)
      root = await this.getInstanceByPort(portRef, root.entryPort)
    }
    return root
  }

  /**
   * get a contrainer instance given its entry port and its mounting port
   * @param {Object} port the entry port for the container
   * @param {Object} parentPort the entry port of the parent container
   */
  async getInstanceByPort (port, parentPort) {
    let instance = this._containerInstances.get(port)
    // if there is no container running crceate one
    if (!instance) {
      instance = await this.createInstance(port.type, port.link, port, parentPort)
      instance.on('idle', () => {
        // once the container is done shut it down
        this._containerInstances.delete(port)
      })
    }
    return instance
  }

  /**
   * given a port, wait untill its source contract has reached the threshold
   * tick count
   * @param {Object} port the port to wait on
   * @param {Number} threshold the number of ticks to wait before resolving
   * @param {Object} fromPort the entryPort of the container requesting the
   * wait. Used internally so that waits don't become cyclic
   */
  async wait (port, threshold, fromPort) {
    let instance = this._containerInstances.get(port)
    if (instance) {
      return instance.wait(threshold, fromPort)
    } else {
      return threshold
    }
  }

  /**
   *  creates an instance given the container type, starting state, entry port
   *  and the parentPort
   *  @param {String} the type of VM to load
   *  @param {Object} the starting state of the VM
   *  @param {Object} the entry port
   *  @param {Object} the parent port
   */
  async createInstance (type, state, entryPort = null, parentPort) {
    const container = this._containerTypes[type]

    if (!state) {
      state = {
        '/': container.Constructor.createState()
      }
    }

    // create a new kernel instance
    const exoInterface = new ExoInterface({
      entryPort: entryPort,
      parentPort: parentPort,
      hypervisor: this,
      state: state,
      container: container
    })

    // save the newly created instance
    this._containerInstances.set(entryPort, exoInterface)
    await exoInterface.start()
    return exoInterface
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Container} container an container instance
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot (container, ticks) {
    await container.wait(ticks)
    return this.graph.flush(container.state)
  }

  /**
   * regirsters a container with the hypervisor
   * @param {String} type - the name of the type
   * @param {Class} Constructor - a Class for instantiating the container
   * @param {*} args - any args that the contructor takes
   */
  registerContainer (type, Constructor, args) {
    this._containerTypes[type] = {
      Constructor: Constructor,
      args: args
    }
  }
}
