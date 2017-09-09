const binarySearchInsert = require('binary-search-insert')
const LockMap = require('lockmap')

module.exports = class Scheduler {
  /**
   * The Sceduler manages the run cycle of the containes and figures out which
   * order they should run in
   */
  constructor () {
    this._waits = []
    this._running = new Set()
    this._loadingInstances = new LockMap()
    this.instances = new Map()
    this.systemServices = new Map()
  }

  /**
   * locks the scheduler from clearing waits untill the lock is resolved
   * @param {string} id
   * @return {function} the resolve function to call once it to unlock
   */
  lock (id) {
    return this._loadingInstances.lock(id)
  }

  /**
   * updates an instance with a new tick count
   * @param {Object} instance - a container instance
   */
  update (instance) {
    this._waits = this._waits.filter(wait => wait.id !== instance.id)
    this._update(instance)
    this._running.add(instance.id)
    this._checkWaits()
  }

  _update (instance) {
    // sorts the container instance map by tick count
    this.instances.delete(instance.id)
    const instanceArray = [...this.instances]
    binarySearchInsert(instanceArray, comparator, [instance.id, instance])
    this.instances = new Map(instanceArray)

    function comparator (a, b) {
      return a[1].ticks - b[1].ticks
    }
  }

  /**
   * returns a container
   * @param {string} id
   * @return {object}
   */
  getInstance (id) {
    return this.instances.get(id) || this._loadingInstances.getLock(id) || this.systemServices.get(id)
  }

  /**
   * deletes an instance from the scheduler
   * @param {string} id - the containers id
   */
  done (id) {
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
  wait (ticks = Infinity, id) {
    this._running.delete(id)
    return new Promise((resolve, reject) => {
      binarySearchInsert(this._waits, comparator, {
        ticks: ticks,
        resolve: resolve,
        id: id
      })
      this._checkWaits()
    })

    function comparator (a, b) {
      return a.ticks - b.ticks
    }
  }

  /**
   * returns the oldest container's ticks
   * @return {integer}
   */
  leastNumberOfTicks () {
    const nextValue = this.instances.values().next().value
    return nextValue ? nextValue.ticks : 0
  }

  // checks outstanding waits to see if they can be resolved
  _checkWaits () {
    // if there are no running containers
    if (!this.instances.size) {
      // clear any remanding waits
      this._waits.forEach(wait => wait.resolve())
      this._waits = []
    } else {
      // find the old container and see if to can resolve any of the waits
      const least = this.leastNumberOfTicks()
      for (const index in this._waits) {
        const wait = this._waits[index]
        if (wait.ticks <= least) {
          wait.resolve()
          this._running.add(wait.id)
        } else {
          this._waits.splice(0, index)
          break
        }
      }
      if (!this._running.size) {
        // if there are no containers running find the oldest wait and update
        // the oldest containers to it ticks
        const oldest = this._waits[0].ticks
        for (let instance of this.instances) {
          instance = instance[1]
          if (instance.ticks > oldest) {
            break
          } else {
            instance.ticks = oldest
            this._update(instance)
          }
        }
        return this._checkWaits()
      }
    }
  }
}
