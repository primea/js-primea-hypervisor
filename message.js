const EventEmitter = require('events')
const {ID} = require('./systemObjects.js')

/**
 * This implements Messages for Primea
 * @module primea-message
 */
module.exports = class Message extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {ArrayBuffer} opts.data - the payload of the message
   * @param {Array<Object>} opts.caps - an array of capabilities to send in the message
   */
  constructor (opts) {
    super()
    const defaults = this.constructor.defaults
    this._opts = Object.assign(defaults, opts)
    Object.keys(this._opts).forEach(key => {
      Object.defineProperty(this, key, {
        get: function () {
          return this._opts[key]
        },
        set: function (y) {
          this._opts[key] = y
        }
      })
    })
  }

  static get defaults () {
    return {
      ticks: 0,
      funcRef: null,
      funcArguments: [],
      funcParameters: [],
      _fromId: new ID(Buffer.alloc(20)),
      _fromTicks: 0
    }
  }
}
