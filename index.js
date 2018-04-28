const Buffer = require('safe-buffer').Buffer
const Actor = require('./actor.js')
const Scheduler = require('./scheduler.js')
const {decoder, generateId, ModuleRef, ActorRef} = require('primea-objects')

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Object} opts
   * @param {Object} opts.tree - a [radix tree](https://github.com/dfinity/js-dfinity-radix-tree) to store the state
   * @param {Array} opts.container - an array of containers to regester
   * @param {Array} opts.drivers - an array of drivers to install
   * @param {boolean} [opts.meter=true] - whether to meter gas or not
   */
  constructor (opts) {
    opts.tree.dag.decoder = decoder
    this.tree = opts.tree
    this.scheduler = new Scheduler(this)
    this._modules = {}
    this.nonce = opts.nonce || 0
    this.meter = opts.meter !== undefined ? opts.meter : true;
    (opts.modules || []).forEach(mod => this.registerModule(mod));
    (opts.drivers || []).forEach(driver => this.registerDriver(driver))
  }

  /**
   * sends a message(s). If an array of message is given the all the messages will be sent at once
   * @param {Object} message - the [message](https://github.com/primea/js-primea-message) to send
   * @returns {Promise} a promise that resolves once the receiving container is loaded
   */
  send (messages) {
    if (!Array.isArray(messages)) {
      messages = [messages]
    }
    this.scheduler.queue(messages)
  }

  /**
   * loads an actor from the tree given its id
   * @param {ID} id
   * @returns {Promise<Actor>}
   */
  async loadActor (id) {
    const state = await this.tree.get(id.id)
    const [module, storage] = await Promise.all([
      this.tree.graph.tree(state.node, '1'),
      this.tree.graph.get(state.node, '2')
    ])
    const [type, nonce] = state.value
    const Container = this._modules[type]

    // create a new actor instance
    const actor = new Actor({
      hypervisor: this,
      state,
      Container,
      id,
      nonce,
      module,
      storage,
      tree: this.tree
    })

    await actor.startup()
    return actor
  }

  newActor (mod, code) {
    const modRef = this.createModule(mod, code)
    return this.createActor(modRef)
  }

  createModule (mod, code, id = {nonce: this.nonce++, parent: null}) {
    const moduleID = generateId(id)
    const Module = this._modules[mod.typeId]
    const {exports, state} = Module.onCreation(mod.code)
    return new ModuleRef(moduleID, mod.typeId, exports, state, code)
  }

  /**
   * creates an instance of an Actor
   * @param {Integer} type - the type id for the container
   * @param {Object} id - the id for the actor
   */
  createActor (modRef, id = {nonce: this.nonce++, parent: null}) {
    const actorId = generateId(id)
    const metaData = [modRef.type, 0]

    // save the container in the state
    this.tree.set(actorId.id, metaData).then(node => {
      // save the code
      node[1] = [modRef.id.id, {
        '/': modRef.code['/']
      }]
      // save the storage
      node[2] = {
        '/': modRef.state
      }
    })

    return new ActorRef(actorId, modRef)
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot () {
    if (this.scheduler._running) {
      await new Promise((resolve, reject) => {
        this.scheduler.once('idle', resolve)
      })
    }
    // console.log(JSON.stringify(this.tree.root, null, 2))
    await this.tree.set(Buffer.from([0]), this.nonce)
    return this.tree.flush()
  }

  /**
   * set the state root. The promise must resolve before creating or sending any more messages to the hypervisor
   * @param {Buffer} stateRoot
   * @return {Promise}
   */
  async setStateRoot (stateRoot) {
    this.tree.root = stateRoot
    const node = await this.tree.get(Buffer.from([0]))
    this.nonce = node.value
  }

  /**
   * regesters a container with the hypervisor
   * @param {Function} Constructor - the container's constuctor
   */
  registerModule (Constructor) {
    this._modules[Constructor.typeId] = Constructor
  }

  /**
   * register a driver with the hypervisor
   * @param {driver} driver
   */
  registerDriver (driver) {
    driver.startup(this)
    this.scheduler.drivers.set(driver.id.toString(), driver)
  }
}
