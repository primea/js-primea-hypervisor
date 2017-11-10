module.exports = class AddressBook {
  /**
   * The port manager manages the the ports. This inculdes creation, deletion
   * fetching and waiting on ports
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.hypervisor
   * @param {Object} opts.exoInterface
   */
  constructor (opts) {
    this.addresses = this.state.addresses
    this._unboundAddresses = new Set()
  }

  /**
   * binds a port to a name
   * @param {Object} port - the port to bind
   * @param {String} name - the name of the port
   */
  async store (name, address) {
    if (!this.isUnbound(address)) {
      throw new Error('invalid address')
    } else {
      this._unboundAddresses.delete(address)

      // save the port instance
      this.addresses[name] = address
    }
  }

  /**
   * gets a port given it's name
   * @param {String} name
   * @return {Object}
   */
  get (name) {
    return this.addresses[name]
  }

  /**
   * delete an port given the name it is bound to
   * @param {string} name
   */
  delete (name) {
    delete this.addresses[name]
  }

  /**
   * clears any unbounded ports referances
   */
  clearUnboundedAddresses () {
    this._unboundAddresses.clear()
  }

  /**
   * check if a port object is still valid
   * @param {Object} port
   * @return {Boolean}
   */
  isUnbound (port) {
    return this._unboundAddresses.has(port)
  }

  addAddressToMessage (message, address) {
    this._unboundAddresses.delete(address)
    return message.ports.push(address)
  }

  getAddressFromMessage (message, index) {
    const address = message.ports[index]
    this._unboundAddresses.add(address)
    delete message.ports[index]
    return address
  }
}
