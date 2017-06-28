const Graph = require('ipld-graph-builder')
const Message = require('primea-message')
const ExoInterface = require('./exoInterface.js')
const Scheduler = require('./scheduler.js')

const ROOT_ID = 'zdpuAm6aTdLVMUuiZypxkwtA7sKm7BWERy8MPbaCrFsmiyzxr'

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Graph} dag an instance of [ipfs.dag](https://github.com/ipfs/interface-ipfs-core/tree/master/API/dag#dag-api)
   */
  constructor (dag, state = {}) {
    this.graph = new Graph(dag)
    this.scheduler = new Scheduler()
    this.state = state
    this._containerTypes = {}
    this._nodesToCheck = new Set()
    this._loadingInstances = new Map()
  }

  /**
   * add a potaintail node in the state graph to check for garbage collection
   * @param {string} id
   */
  addNodeToCheck (id) {
    this._nodesToCheck.add(id)
  }

  /**
   * removes a potaintail node in the state graph to check for garbage collection
   * @param {string} id
   */
  removeNodeToCheck (id) {
    this._nodesToCheck.delete(id)
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
  async _loadInstance (id, lock) {
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
    this.scheduler.releaseLock(lock)
    this.scheduler.update(exoInterface)
    return exoInterface
  }

  /**
   * gets an existsing container instances
   * @param {string} id - the containers ID
   * @returns {Promise}
   */
  getInstance (id) {
    let instance = this.scheduler.getInstance(id) || this._loadingInstances.get(id)
    if (instance) {
      // console.log('have instance', id)
      return instance
    } else {
      const lock = this.scheduler.getLock()
      const promise = this._loadInstance(id, lock)
      promise.then(() => {
        this._loadingInstances.delete(id)
      })

      this._loadingInstances.set(id, promise)
      return promise
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
    const lock = this.scheduler.getLock()
    id = await this.getHashFromObj(id)
    const state = {
      nonce: [0],
      ports: {},
      type: type,
      code: code
    }

    // save the container in the state
    await this.graph.set(this.state, id, state)
    // create the container instance
    const exoInterface = await this._loadInstance(id, lock)
    // send the intialization message
    exoInterface.queue(null, new Message({
      ports: entryPorts
    }))

    return exoInterface
  }

  /**
   * deletes container from the state
   * @param {string} id
   */
  deleteInstance (id) {
    if (id !== ROOT_ID) {
      this._nodesToCheck.delete(id)
      delete this.state[id]
    }
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

// Implements a parrilizable DFS check for graph connictivity given a set of nodes
// and a root node. Stating for the set of node to check this does a DFS and
// will return a set a nodes if any that is not connected to the root node.
async function DFSchecker (graph, state, root, nodes) {
  const checkedNodesSet = new Set()
  let hasRootSet = new Set()
  const promises = []

  for (const id of nodes) {
    // create a set for each of the starting nodes to track the nodes the DFS has
    // has traversed
    const checkedNodes = new Set()
    checkedNodesSet.add(checkedNodes)
    promises.push(check(id, checkedNodes))
  }

  // wait for all the search to complete
  await Promise.all(promises)
  // remove the set of nodes that are connected to the root
  checkedNodesSet.delete(hasRootSet)
  let unLinkedNodesArray = []

  // combine the unconnected sets into a single array
  for (const set of checkedNodesSet) {
    unLinkedNodesArray = unLinkedNodesArray.concat([...set])
  }
  return unLinkedNodesArray

  // does the DFS starting with a single node ID
  async function check (id, checkedNodes) {
    if (!checkedNodesSet.has(checkedNodes) || // check if this DFS is still searching
        checkedNodes.has(id) ||  // check if this DFS has alread seen the node
        hasRootSet === checkedNodes) { // check that this DFS has alread found the root node
      return
    }

    // check if any of the the other DFSs have seen this node and if so merge
    // the sets and stop searching
    for (const set of checkedNodesSet) {
      if (set.has(id)) {
        checkedNodes.forEach(id => set.add(id))
        checkedNodesSet.delete(checkedNodes)
        return
      }
    }

    // mark the node 'checked'
    checkedNodes.add(id)

    // check to see if we are at the root
    if (id === root) {
      hasRootSet = checkedNodes
      return
    }

    const node = state[id]['/']
    const promises = []
    // iterate through the nodes ports and recursivly check them
    for (const name in node.ports) {
      const port = node.ports[name]
      promises.push(check(port.destId, checkedNodes))
    }
    return Promise.all(promises)
  }
}
