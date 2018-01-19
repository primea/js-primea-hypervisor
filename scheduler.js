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
    this.actors = new SortedMap(comparator)
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
    this.actors.set(id, p)
    this._running.add(id)
    return r
  }

  /**
   * updates an actor with a new tick count
   * @param {Object} actor - an actor instance
   */
  update (actor) {
    this._update(actor)
    this._running.add(actor.id.toString('hex'))
    this._checkWaits()
  }

  _update (actor) {
    this.actors.delete(actor.id.toString('hex'))
    this.actors.set(actor.id.toString('hex'), actor)
  }

  /**
   * returns an Actor instance
   * @param {String} id
   * @return {Object}
   */
  getActor (id) {
    id = id.toString('hex')
    return this.actors.get(id)
  }

  /**
   * deletes an actor from the scheduler
   * @param {String} id - the containers id
   */
  done (id) {
    id = id.toString('hex')
    this._running.delete(id)
    this.actors.delete(id)
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
    for (const actor of this.actors) {
      ticks = actor[1].ticks
      if (actor[1].id !== exclude) {
        return ticks
      }
    }

    return ticks
  }

  // checks outstanding waits to see if they can be resolved
  _checkWaits () {
    // if there are no instances, clear any remaining waits
    if (!this.actors.size) {
      // console.log('here', this._waits)
      this._waits.forEach(wait => wait.resolve())
      this._waits = []
      return
    }

    // find the oldest container, see if any of the waits can be resolved
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
      for (let actor of this.actors) {
        actor = actor[1]
        if (actor.ticks > oldest) {
          break
        }
        actor.ticks = oldest
        this._update(actor)
      }
      return this._checkWaits()
    }
  }
}
