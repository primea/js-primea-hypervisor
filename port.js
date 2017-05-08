module.exports = class Port {
  constructor (name) {
    this.name = name
    this._queue = []
    this.ticks = 0
  }

  queue (message) {
    this.ticks = message._ticks
    if (this._resolve) {
      return this._resolve(message)
    } else {
      this._queue.push(message)
    }
  }

  // this only workls for one Promise
  nextMessage () {
    const message = this.queue.shift()

    return new Promise((resolve, reject) => {
      if (message) {
        resolve(message)
      } else {
        this._resolve = resolve
      }
    })
  }

  peek () {
    return this._queue[0]
  }

  shift () {
    return this._queue.shift()
  }

  unshift (message) {
    return this._queue.unshift(message)
  }
}
