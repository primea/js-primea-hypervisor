const Graph = require('ipld-graph-builder')
const Message = require('primea-message')
const ExoInterface = require('./exoInterface.js')
const Scheduler = require('./scheduler.js')
const DFSchecker = require('./dfsChecker.js')

const ROOT_ID = 'zdpuAm6aTdLVMUuiZypxkwtA7sKm7BWERy8MPbaCrFsmiyzxr'

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Graph} dag an instance of [ipfs.dag](https://github.com/ipfs/interface-ipfs-core/tree/master/API/dag#dag-api)
   * @param {object} state - the starting state
   */
  constructor (dag, state = {}) {
    this.graph = new Graph(dag)
    this.scheduler = new Scheduler()
    this.state = state
    this._containerTypes = {}
    this._nodesToCheck = new Set()
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
  getDestPort (port) {
    if (port.destPort) {
      return port.destPort
    } else {
      return this.graph.get(this.state, `${port.destId}/ports/${port.destName}`)
    }
  }

  // loads an instance of a container from the state
  async _loadInstance (id) {
    const state = await this.graph.get(this.state, id)
    const container = this._containerTypes[state.type]

    // create a new kernel instance
    const exoInterface = new ExoInterface({
      hypervisor: this,
      state: state,
      container: container,
      id: id
    })

    // save the newly created instance
    this.scheduler.update(exoInterface)
    return exoInterface
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
      const resolve = this.scheduler.getLock(id)
      const instance = await this._loadInstance(id)
      resolve(instance)
      return instance
    }
  }

  /**
   * creates an new container instances and save it in the state
   * @param {string} type - the type of container to create
   * @param {*} code
   * @param {array} entryPorts
   * @param {object} id
   * @param {object} id.nonce
   * @param {object} id.parent
   * @returns {Promise}
   */
  async createInstance (type, code, entryPorts = [], id = {nonce: 0, parent: null}) {
    // create a lock to prevent the scheduler from reloving waits before the
    // new container is loaded
    const resolve = this.scheduler.getLock(id)
    const idHash = await this.getHashFromObj(id)
    const state = {
      nonce: [0],
      ports: {},
      type: type,
      code: code
    }

    // save the container in the state
    await this.graph.set(this.state, idHash, state)
    // create the container instance
    const exoInterface = await this._loadInstance(idHash)

    resolve(exoInterface)
    // send the intialization message
    exoInterface.queue(null, new Message({
      ports: entryPorts
    }))

    return exoInterface
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot (ticks) {
    await this.scheduler.wait(ticks)
    const unlinked = await DFSchecker(this.graph, this.state, ROOT_ID, this._nodesToCheck)
    unlinked.forEach(id => {
      delete this.state[id]
    })
    return this.graph.flush(this.state)
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

  /**
   * get a hash from a POJO
   * @param {object} obj
   * @return {Promise}
   */
  async getHashFromObj (obj) {
    return (await this.graph.flush(obj))['/']
  }
}
