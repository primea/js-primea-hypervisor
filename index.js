const Actor = require('./actor.js')
const Scheduler = require('./scheduler.js')

module.exports = class Hypervisor {
  /**
   * The Hypervisor manages the container instances by instantiating them and
   * destorying them when possible. It also facilitates localating Containers
   * @param {Tree} tree - a [radix tree](https://github.com/dfinity/js-dfinity-radix-tree) to store the state
   */
  constructor (tree) {
    this.tree = tree
    this.scheduler = new Scheduler()
    this._containerTypes = {}
    this.nonce = 0
  }

  /**
   * sends a message
   * @param {Object} cap - the capabilitly used to send the message
   * @param {Object} message - the [message](https://github.com/primea/js-primea-message) to send
   * @returns {Promise} a promise that resolves once the receiving container is loaded
   */
  async send (cap, message) {
    const id = cap.destId
    const instance = await this.getActor(id)
    instance.queue(message)
  }

  // loads an instance of a container from the state
  async _loadActor (id) {
    const state = await this.tree.get(id, true)
    const container = this._containerTypes[state.value.type]

    // create a new actor instance
    const actor = new Actor({
      hypervisor: this,
      state: state,
      container: container,
      id: id
    })

    // save the newly created instance
    this.scheduler.update(actor)
    return actor
  }

  /**
   * gets an existsing actor
   * @param {string} id - the actor's ID
   * @returns {Promise}
   */
  async getActor (id) {
    let actor = this.scheduler.getInstance(id)
    if (actor) {
      return actor
    } else {
      const resolve = this.scheduler.lock(id)
      const actor = await this._loadActor(id)
      await actor.startup()
      resolve(actor)
      return actor
    }
  }

  /**
   * creates an instance of an Actor
   * @param {Integer} type - the type id for the container
   * @param {Object} message - an intial [message](https://github.com/primea/js-primea-message) to send newly created actor
   * @param {Object} id - the id for the actor
   */
  async createActor (type, message, id = {nonce: this.nonce++, parent: null}) {
    const encoded = encodedID(id)
    const idHash = await this._getHashFromObj(encoded)
    const state = {
      nonce: 0,
      caps: {},
      type: type
    }

    const code = message.data
    if (code.length) {
      state.code = code
    }

    // save the container in the state
    await this.tree.set(idHash, state)

    // create the container instance
    const instance = await this._loadActor(idHash)

    // send the intialization message
    await instance.create(message)
    return instance.mintCap()
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
  async createStateRoot (ticks) {
    await this.scheduler.wait(ticks)
    return this.tree.flush()
  }

  /**
   * regirsters a container with the hypervisor
   * @param {Class} Constructor - a Class for instantiating the container
   * @param {*} args - any args that the contructor takes
   * @param {Integer} typeId - the container's type identification ID
   */
  registerContainer (Constructor, args, typeId = Constructor.typeId) {
    this._containerTypes[typeId] = {
      Constructor: Constructor,
      args: args
    }
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
