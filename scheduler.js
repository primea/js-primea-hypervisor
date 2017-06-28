const binarySearchInsert = require('binary-search-insert')

const comparator = function (a, b) {
  return a.ticks - b.ticks
}

const instancesComparator = function (a, b) {
  return a[1].ticks - b[1].ticks
}

module.exports = class Scheduler {
  constructor () {
    this._waits = []
    this._running = new Set()
    this._loadingInstances = new Map()
    this.instances = new Map()
    this.locks = new Set()
  }

  getLock (id) {
    this.locks.add(id)
    return id
  }

  releaseLock (id) {
    this.locks.delete(id)
  }

  update (instance) {
    this._update(instance)
    this._checkWaits()
  }

  _update (instance) {
    this._running.add(instance.id)
    this.instances.delete(instance.id)
    const instanceArray = [...this.instances]
    binarySearchInsert(instanceArray, instancesComparator, [instance.id, instance])
    this.instances = new Map(instanceArray)
  }

  getInstance (id) {
    return this.instances.get(id) || this._loadingInstances.get(id)
  }

  done (instance) {
    this._running.delete(instance.id)
    this.instances.delete(instance.id)
    this._checkWaits()
  }

  wait (ticks = Infinity, id) {
    this._running.delete(id)
    return new Promise((resolve, reject) => {
      binarySearchInsert(this._waits, comparator, {
        ticks: ticks,
        resolve: resolve
      })
      this._checkWaits()
    })
  }

  smallest () {
    return this.instances.size ? [...this.instances][0][1].ticks : 0
  }

  _checkWaits () {
    if (!this.locks.size) {
      // if there are no running containers
      if (!this.isRunning()) {
        // clear any remanding waits
        this._waits.forEach(wait => wait.resolve())
        this._waits = []
      } else if (!this._running.size) {
        const smallest = this._waits[0].ticks
        for (let instance of this.instances) {
          instance = instance[1]
          if (instance.ticks > smallest) {
            break
          } else {
            instance.ticks = smallest
            this._update(instance)
          }
        }
        return this._checkWaits()
      } else {
        const smallest = this.smallest()
        for (const index in this._waits) {
          const wait = this._waits[index]
          if (wait.ticks <= smallest) {
            wait.resolve()
          } else {
            this._waits.splice(0, index)
            break
          }
        }
      }
    }
  }

  isRunning () {
    return this.instances.size
  }
}
