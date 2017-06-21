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
    this._state = state
    this._containerTypes = {}
    this._nodesToCheck = new Set()
  }

  getDestPort (port) {
    if (port.destPort) {
      return port.destPort
    } else {
      return this.graph.get(this._state, `${port.destId}/ports/${port.destName}`)
    }
  }

  /**
   */
  async getInstance (id) {
    let instance = this.scheduler.getInstance(id)
    if (instance) {
      return instance
    } else {
      const lock = this.scheduler.getLock()
      instance = await this._loadInstance(id, lock)
      return instance
    }
  }

  async _loadInstance (id, lock) {
    const state = await this.graph.get(this._state, id)
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
    this.scheduler.releaseLock(lock)
    return exoInterface
  }

  async createInstance (type, code, entryPorts = [], id = {nonce: 0, parent: null}) {
    const lock = this.scheduler.getLock()
    id = await this.getHashFromObj(id)
    const state = {
      nonce: [0],
      ports: {},
      type: type,
      code: code
    }

    await this.graph.set(this._state, id, state)
    const exoInterface = await this._loadInstance(id, lock)
    exoInterface.queue(null, new Message({
      ports: entryPorts
    }))

    return exoInterface
  }

  deleteInstance (id) {
    if (id !== ROOT_ID) {
      this._nodesToCheck.delete(id)
      delete this._state[id]
    }
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot (ticks = Infinity) {
    await this.scheduler.wait(ticks)
    const unlinked = await DFSchecker(this.graph, this._state, ROOT_ID, this._nodesToCheck)
    unlinked.forEach(id => {
      delete this._state[id]
    })
    return this.graph.flush(this._state)
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

  async getHashFromObj (obj) {
    return (await this.graph.flush(obj))['/']
  }
}

async function DFSchecker (graph, state, root, nodes) {
  const checkedNodesSet = new Set()
  let hasRootSet = new Set()
  const promises = []

  for (const id of nodes) {
    const checkedNodes = new Set()
    checkedNodesSet.add(checkedNodes)
    promises.push(check(id, checkedNodes))
  }

  await Promise.all(promises)
  checkedNodesSet.delete(hasRootSet)
  let unLinkedNodesArray = []

  for (const set of checkedNodesSet) {
    unLinkedNodesArray = unLinkedNodesArray.concat([...set])
  }
  return unLinkedNodesArray

  async function check (id, checkedNodes) {
    if (!checkedNodesSet.has(checkedNodes) || checkedNodes.has(id) || hasRootSet === checkedNodes) {
      return
    }

    for (const set of checkedNodesSet) {
      if (set.has(id)) {
        checkedNodes.forEach(id => set.add(id))
        checkedNodesSet.delete(checkedNodes)
        return
      }
    }

    checkedNodes.add(id)

    if (id === root) {
      hasRootSet = checkedNodes
      return
    }

    const node = await graph.get(state, id)
    const promises = []
    for (const name in node.ports) {
      const port = node.ports[name]
      promises.push(check(port.destId, checkedNodes))
    }
    return Promise.all(promises)
  }
}
