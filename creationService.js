const chunk = require('chunk')

const MAX_DATA_BYTES = 65533

module.exports = class CreationService {
  constructor (opts) {
    this.hypervisor = opts.hypervisor
    this.scheduler = this.hypervisor.scheduler
  }

  queue (port, message) {
    if (message.data.type) {
      const creator = this.scheduler.getInstance(message.fromId)
      const id = creator.generateNextId()
      return this.createInstance(message, id)
    }
  }

  getPort () {
    return {
      messages: [],
      destId: 0
    }
  }

  /**
   * creates an new container instances and save it in the state
   * @returns {Promise}
   */
  async createInstance (message, id = {nonce: 0, parent: null}) {
    const idHash = await this._getHashFromObj(id)
    const state = {
      nonce: [0],
      ports: {},
      type: message.data.type
    }

    if (message.data.code && message.data.code.length) {
      state.code = message.data.code
    }

    // create the container instance
    const instance = await this.hypervisor._loadInstance(idHash, state)

    // send the intialization message
    await instance.create(message)

    if (Object.keys(instance.ports.ports).length || instance.id === this.hypervisor.ROOT_ID) {
      if (state.code && state.code.length > MAX_DATA_BYTES) {
        state.code = chunk(state.code, MAX_DATA_BYTES).map(chk => {
          return {
            '/': chk
          }
        })
      }
      // save the container in the state
      await this.hypervisor.tree.set(idHash, state)
    } else {
      this.scheduler.done(idHash)
    }

    return instance
  }

  // get a hash from a POJO
  _getHashFromObj (obj) {
    return this.hypervisor.graph.flush(obj).then(obj => obj['/'])
  }
}
