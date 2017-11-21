module.exports = class CapsManager {
  /**
   * The caps manager manages perstantly stores the capabilities
   * fetching and waiting on ports
   * @param {Object} caps
   */
  constructor (caps) {
    this._storedCaps = caps
    this.clist = new Set()
  }

  /**
   * Stores a capability persistantly
   * @param {String} key
   * @param {Object} cap
   */
  store (key, cap) {
    this._storedCaps[key] = cap
  }

  /**
   * gets a cap given it's key
   * @param {String} key
   * @return {Object}
   */
  get (key) {
    const cap = this._storedCaps[key]
    return cap
  }

  /**
   * delete an cap given its key
   * @param {string} key
   */
  delete (key) {
    delete this._storedCaps[key]
  }
}
