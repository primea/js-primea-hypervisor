module.exports = class CapsManager {
  /**
   * The port manager manages the the ports. This inculdes creation, deletion
   * fetching and waiting on ports
   * @param {Object} opts
   * @param {Object} opts.state
   * @param {Object} opts.hypervisor
   * @param {Object} opts.exoInterface
   */
  constructor (caps) {
    this._storedCaps = caps
  }

  /**
   * binds a port to a name
   * @param {Object} port - the port to bind
   * @param {String} name - the name of the port
   */
  store (name, cap) {
    // save the port instance
    this._storedCaps[name] = cap
  }

  /**
   * gets a port given it's name
   * @param {String} name
   * @return {Object}
   */
  get (name) {
    const cap = this._storedCaps[name]
    return cap
  }

  /**
   * delete an port given the name it is bound to
   * @param {string} name
   */
  delete (name) {
    delete this._storedCaps[name]
  }
}
