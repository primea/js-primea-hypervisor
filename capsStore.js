module.exports = class CapsStore {
  /**
   * The caps store, persistantly stores an actors capabilites.
   * @param {Object} storedCaps
   */
  constructor (storedCaps) {
    this._storedCaps = storedCaps
  }

  /**
   * Stores a cap at a given key
   * @param {String} key
   * @param {Object} cap
   */
  store (key, cap) {
    // save the port instance
    this._storedCaps[key] = cap
  }

  /**
   * gets a cap given its key
   * @param {String} key
   * @return {Object}
   */
  load (key) {
    const cap = this._storedCaps[key]
    return cap
  }

  /**
   * delete cap given its key
   * @param {string} key
   */
  delete (key) {
    delete this._storedCaps[key]
  }
}
