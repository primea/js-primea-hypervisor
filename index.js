const Kernel = require('./kernel.js')
const Scheduler = require('./scheduler.js')
const DFSchecker = require('./dfsChecker.js')
const CreationService = require('./creationService.js')

const CREATION_ID = 0

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Graph} dag an instance of [ipfs.dag](https://github.com/ipfs/interface-ipfs-core/tree/master/API/dag#dag-api)
   * @param {object} state - the starting state
   */
  constructor (tree) {
    this.tree = tree
    this.scheduler = new Scheduler()
    this._containerTypes = {}
    this._nodesToCheck = new Set()

    this.creationService = new CreationService({
      hypervisor: this
    })
    this.scheduler.systemServices.set(CREATION_ID, this.creationService)
    this.pinnedIds = new Set()
  }

  /**
   * add a potaintail node in the state graph to check for garbage collection
   * @param {string} id
   */
  addNodeToCheck (id) {
    this._nodesToCheck.add(id)
  }

  /**
   * given a port, this finds the corridsponeding endpoint port of the channel
   * @param {object} port
   * @returns {Promise}
   */
  async getDestPort (port) {
    if (port.destPort) {
      return port.destPort
    } else {
      const instance = await this.scheduler.getInstance(port.destId)
      let containerState
      if (instance) {
        containerState = instance.state
      } else {
        let {value} = await this.tree.get(port.destId, true)
        containerState = value
      }
      return this.tree.graph.get(containerState, `ports/${port.destName}`)
    }
  }

  async send (port, message) {
    const id = port.destId
    if (id !== undefined) {
      const instance = await this.getInstance(id)
      return instance.queue(port, message)
    } else {
      // port is unbound
      port.destPort.messages.push(message)
    }
  }

  // loads an instance of a container from the state
  async _loadInstance (id) {
    const state = await this.tree.get(id, true)
    const container = this._containerTypes[state.value.type]

    // create a new kernel instance
    const kernel = new Kernel({
      hypervisor: this,
      state: state.value,
      node: state.node,
      code: state.value.code,
      container: container,
      id: id
    })

    // save the newly created instance
    this.scheduler.update(kernel)
    return kernel
  }

  /**
   * gets an existsing container instances
   * @param {string} id - the containers ID
   * @returns {Promise}
   */
  async getInstance (id) {
    let instance = this.scheduler.getInstance(id)
    if (instance) {
      return instance
    } else {
      const resolve = this.scheduler.lock(id)
      const instance = await this._loadInstance(id)
      await instance.startup()
      resolve(instance)
      return instance
    }
  }

  getResponsePort (message) {
    if (message.responsePort) {
      return message.responsePort.destPort
    } else {
      const [portRef1, portRef2] = this.createChannel()
      message.responsePort = portRef2
      return portRef1
    }
  }

  createChannel () {
    const port1 = {
      messages: []
    }

    const port2 = {
      messages: [],
      destPort: port1
    }

    port1.destPort = port2
    return [port1, port2]
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot (ticks) {
    await this.scheduler.wait(ticks)

    const unlinked = await DFSchecker(this.tree, this._nodesToCheck, (id) => {
      return this.pinnedIds.has(id)
    })
    for (const id of unlinked) {
      await this.tree.delete(id)
    }

    return this.tree.flush()
  }

  /**
   * regirsters a container with the hypervisor
   * @param {Class} Constructor - a Class for instantiating the container
   * @param {*} args - any args that the contructor takes
   * @param {interger} typeId - the container's type identification ID
   */
  registerContainer (Constructor, args, typeId = Constructor.typeId) {
    this._containerTypes[typeId] = {
      Constructor: Constructor,
      args: args
    }
  }

  pin (instance) {
    this.pinnedIds.add(instance.id)
  }
}
