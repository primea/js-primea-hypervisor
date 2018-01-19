const Actor = require('./actor.js')
const Scheduler = require('./scheduler.js')

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Tree} tree - a [radix tree](https://github.com/dfinity/js-dfinity-radix-tree) to store the state
   */
  constructor (tree, nonce = 0) {
    this.tree = tree
    this.scheduler = new Scheduler()
    this._containerTypes = {}
    this.nonce = nonce
  }

  /**
   * sends a message
   * @param {Object} cap - the capabilitly used to send the message
   * @param {Object} message - the [message](https://github.com/primea/js-primea-message) to send
   * @returns {Promise} a promise that resolves once the receiving container is loaded
   */
  async send (message) {
    const id = message.funcRef.destId
    const actor = await this.getActor(id)
    actor.queue(message)
  }

  async _loadActor (id) {
    const state = await this.tree.getSubTree(id)
    const {type, nonce} = Actor.deserializeMetaData(state.root['/'][3])
    const container = this._containerTypes[type]

    // create a new actor instance
    const actor = new Actor({
      hypervisor: this,
      state,
      container,
      id,
      nonce,
      type
    })

    await actor.startup()
    this.scheduler.update(actor)
    return actor
  }

  /**
   * gets an existsing actor
   * @param {string} id - the actor's ID
   * @returns {Promise}
   */
  async getActor (id) {
    let actor = this.scheduler.getActor(id)
    if (!actor) {
      const resolve = this.scheduler.lock(id)
      actor = await this._loadActor(id)
      resolve(actor)
    }
    return actor
  }

  /**
   * creates an instance of an Actor
   * @param {Integer} type - the type id for the container
   * @param {Object} message - an intial [message](https://github.com/primea/js-primea-message) to send newly created actor
   * @param {Object} id - the id for the actor
   */
  async createActor (type, code, id = {nonce: this.nonce++, parent: null}) {
    const encoded = encodedID(id)
    const idHash = await this._getHashFromObj(encoded)
    const metaData = Actor.serializeMetaData(type)

    // save the container in the state
    this.tree.set(idHash, metaData)
    const Container = this._containerTypes[type]
    await Container.validate(code)
    const module = await Container.compile(code)
    return {
      id: idHash,
      exports: Container.exports(module, idHash)
    }
  }

  // get a hash from a POJO
  _getHashFromObj (obj) {
    return this.tree.constructor.getMerkleLink(obj)
  }

  /**
   * creates a state root starting from a given container and a given number of
   * ticks
   * @param {Number} ticks the number of ticks at which to create the state root
   * @returns {Promise}
   */
  async createStateRoot (ticks = Infinity) {
    await this.scheduler.wait(ticks)
    return this.tree.flush()
  }

  /**
   * regirsters a container with the hypervisor
   * @param {Class} Constructor - a Class for instantiating the container
   * @param {*} args - any args that the contructor takes
   * @param {Integer} typeId - the container's type identification ID
   */
  registerContainer (Constructor) {
    this._containerTypes[Constructor.typeId] = Constructor
  }
}

function encodedID (id) {
  const nonce = Buffer.from([id.nonce])
  if (id.parent) {
    return Buffer.concat([nonce, id.parent])
  } else {
    return nonce
  }
}
