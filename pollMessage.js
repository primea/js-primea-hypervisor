const Message = require('./')
module.exports = class PollMessage extends Message {
  constructor (threshold) {
    super()
    this.threshold = threshold
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve
    })
  }

  get isSystem () {
    return true
  }

  get isPoll () {
    return true
  }

  response () {
    return this.promise
  }

  respond (tickPromise) {
    this._resolve(tickPromise)
  }
}
