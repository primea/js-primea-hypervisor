module.exports = class Port {
  constructor (name) {
    this.name = name
    this._queue = []
    this.ticks = 0
  }

  queue (message) {
    this.ticks = message._fromPortTicks
    this._queue.push(message)
  }

  peek () {
    return this._queue[0]
  }

  shift () {
    return this._queue.shift()
  }

  get size () {
    return this._queue.length
  }
}
