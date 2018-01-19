const binarySearchInsert = require('binary-search-insert')
const SortedMap = require('sortedmap')

function comparator (a, b) {
  return a.ticks - b.ticks
}

module.exports = class Scheduler {
  /**
   * The Scheduler manages the actor instances and tracks how many "ticks" they
   * have ran.
   */
  constructor () {
    this._waits = []
    this._running = new Set()
    this.instances = new SortedMap(comparator)
  }

  /**
   * locks the scheduler from clearing waits untill the lock is resolved
   * @param {string} id
   * @return {function} the resolve function to call once it to unlock
   */
  lock (id) {
    id = id.toString('hex')
    let r
    const p = new Promise((resolve, reject) => {
      r = resolve
    })
    p.ticks = 0
    this.instances.set(id, p)
    this._running.add(id)
    return r
  }

  /**
   * updates an instance with a new tick count
   * @param {Object} instance - an actor instance
   */
  update (instance) {
    this._update(instance)
    this._running.add(instance.id.toString('hex'))
    this._checkWaits()
  }

  _update (instance) {
    this.instances.delete(instance.id.toString('hex'))
    this.instances.set(instance.id.toString('hex'), instance)
  }

  /**
   * returns an Actor instance
   * @param {String} id
   * @return {Object}
   */
  getInstance (id) {
    id = id.toString('hex')
    return this.instances.get(id)
  }

  /**
   * deletes an instance from the scheduler
   * @param {String} id - the containers id
   */
  done (id) {
    id = id.toString('hex')
    this._running.delete(id)
    this.instances.delete(id)
    this._checkWaits()
  }

  /**
   * returns a promise that resolves once all containers have reached the given
   * number of ticks
   * @param {interger} ticks - the number of ticks to wait
   * @param {string} id - optional id of the container that is waiting
   * @return {Promise}
   */
  wait (ticks, id) {
    if (id) {
      id = id.toString('hex')
      this._running.delete(id)
    }

    return new Promise((resolve, reject) => {
      binarySearchInsert(this._waits, comparator, {
        ticks: ticks,
        resolve: resolve,
        id: id
      })
      this._checkWaits()
    })
  }

  /**
   * returns the oldest container's ticks
   * @return {integer}
   */
  leastNumberOfTicks (exclude) {
    let ticks = Infinity
    for (const instance of this.instances) {
      ticks = instance[1].ticks
      if (instance[1].id !== exclude) {
        return ticks
      }
    }

    return ticks
  }

  // checks outstanding waits to see if they can be resolved
  _checkWaits () {
    // if there are no instances, clear any remaining waits
    if (!this.instances.size) {
      // console.log('here', this._waits)
      this._waits.forEach(wait => wait.resolve())
      this._waits = []
      return
    }

    // find the old container, see if any of the waits can be resolved
    while (this._waits[0]) {
      const wait = this._waits[0]
      const least = this.leastNumberOfTicks(wait.id)
      if (wait.ticks <= least) {
        this._waits.shift()
        wait.resolve()
        this._running.add(wait.id)
      } else {
        break
      }
    }

    // if there are no containers running find the oldest wait
    // and update the oldest containers to its ticks
    if (!this._running.size && this._waits.length) {
      const oldest = this._waits[0].ticks
      for (let instance of this.instances) {
        instance = instance[1]
        if (instance.ticks > oldest) {
          break
        }
        instance.ticks = oldest
        this._update(instance)
      }
      return this._checkWaits()
    }
  }
}
