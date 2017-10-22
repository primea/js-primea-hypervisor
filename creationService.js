const Message = require('primea-message')
const DeleteMessage = require('./deleteMessage.js')

module.exports = class CreationService {
  constructor (opts) {
    this.hypervisor = opts.hypervisor
    this.scheduler = this.hypervisor.scheduler
  }

  queue (port, message) {
    if (message.data[0] === 0x00) {
      let id
      if (message.fromId) {
        const creator = this.scheduler.getInstance(message.fromId)
        id = creator.generateNextId()
      }
      return this.createInstance(message, id)
    } else if (message.responsePort && !(message instanceof DeleteMessage)) {
      this.send(message.responsePort, new Message({
        ports: [this.getPort()]
      }))
    }
  }

  getPort () {
    return {
      messages: [],
      destId: 0
    }
  }

  send (port, message) {
    message._hops++
    message._fromTicks = this.ticks
    message.fromId = this.id

    return this.hypervisor.send(port, message)
  }

  /**
   * creates an new container instances and save it in the state
   * @returns {Promise}
   */
  async createInstance (message, id = {nonce: 0, parent: null}) {
    const encoded = encodedID(id)
    const idHash = await this._getHashFromObj(encoded)
    const state = {
      nonce: 0,
      ports: {},
      type: message.data[1]
    }

    const code = message.data.slice(2)
    if (code.length) {
      state.code = code
    }

    // save the container in the state
    await this.hypervisor.tree.set(idHash, state)

    // create the container instance
    const instance = await this.hypervisor._loadInstance(idHash)

    // send the intialization message
    await instance.create(message)

    if (!Object.keys(instance.ports.ports).length) {
      this.hypervisor.addNodeToCheck(instance.id)
    }

    return instance
  }

  get state () {
    return {}
  }

  // get a hash from a POJO
  _getHashFromObj (obj) {
    return this.hypervisor.tree.constructor.getMerkleLink(obj)
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
