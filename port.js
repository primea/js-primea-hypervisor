module.exports = class Port {
  /**
   * a simple repsentation of a port
   * @property {Interger} ticks - the last know number of ticks the
   * corrisponding container is at
   */
  constructor (name) {
    this._queue = []
    this.ticks = 0
    this.name = name
  }

  /**
   * queues a message on the port
   * @param {Message}
   */
  queue (message) {
    this.ticks = message._fromPortTicks
    this._queue.push(message)
  }

  /**
   * returns the message at the front of the queue
   * @returns {Message}
   */
  peek () {
    return this._queue[0]
  }

  /**
   * dequeue a message
   * @returns {Message}
   */
  dequeue () {
    return this._queue.shift()
  }

  /**
   * returns the size of the queue
   * @returns {Integer}
   */
  get size () {
    return this._queue.length
  }
}
