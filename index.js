const Graph = require('ipld-graph-builder')
const ExoInterface = require('./exoInterface.js')
const Message = require('primea-message')

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Graph} dag an instance of [ipfs.dag](https://github.com/ipfs/interface-ipfs-core/tree/master/API/dag#dag-api)
   */
  constructor (dag, state = {}) {
    this._state = state
    this.graph = new Graph(dag)
    this._containerTypes = {}
  }

  /**
   */
  async getInstance (id) {
    let instance = await this.scheduler.instances.get(id)
    // if there is no container running crceate one
    if (!instance) {
      const promise = this._loadInstance(id)
      this.scheduler.instances.set(id, promise)
      instance = await promise
      instance.once('idle', () => {
        // once the container is done shut it down
        this.scheduler.done(instance)
      })
    }
    return instance
  }

  async _loadInstance (id) {
    const state = await this.graph.get(this._state, id)
    const Container = this._containerTypes[state.type]

    // create a new kernel instance
    const exoInterface = new ExoInterface({
      hypervisor: this,
      state: state,
      Container: Container
    })

    // save the newly created instance
    this.scheduler.update(exoInterface)
    return exoInterface
  }

  async createInstance (id, type, code, entryPort) {
    const state = {
      '/': {
        nonce: 0,
        ports: {},
        type: type,
        id: {
          '/': id
        },
        code: code
      }
    }
    await this.graph.set(this._state, id, state)
    const exoInterface = await this._loadInstance(id)
    exoInterface.queue(null, new Message(entryPort))

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
}
