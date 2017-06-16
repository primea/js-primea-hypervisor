const binarySearchInsert = require('binary-search-insert')

const comparator = function (a, b) {
  return a.ticks - b.ticks
}

module.exports = class Scheduler {
  constructor () {
    this._waits = []
    this.instances = new Map()
    this.locks = new Set()
  }

  getLock () {
    const id = Symbol('lock')
    this.locks.add(id)
    return id
  }

  releaseLock (id) {
    this.locks.delete(id)
  }

  update (instance, ticks = this.oldest()) {
    this.instances.delete(instance.id)
    const instanceArray = [...this.instances]
    binarySearchInsert(instanceArray, comparator, [instance.id, {
      ticks: ticks,
      instance: instance
    }])
    this.instances = new Map(instanceArray)
    this._checkWaits()
  }

  getInstance (id) {
    const item = this.instances.get(id)
    if (item) {
      return item.instance
    }
  }

  done (instance) {
    this.instances.delete(instance.id)
    this._checkWaits()
  }

  wait (ticks) {
    if (ticks <= this.oldest() || !this.isRunning()) {
      return
    } else {
      return new Promise((resolve, reject) => {
        binarySearchInsert(this._waits, comparator, {
          ticks: ticks,
          resolve: resolve
        })
      })
    }
  }

  oldest () {
    const oldest = [...this.instances][0]
    return oldest ? oldest[1].ticks : 0
  }

  _checkWaits () {
    if (!this.isRunning()) {
      // clear any remanding waits
      this._waits.forEach(wait => {
        wait.resolve()
      })
      this._waits = []
    } else {
      const oldest = this.oldest()
      for (const wait in this._waits) {
        if (wait.ticks <= oldest) {
          wait.resolve()
          this._waits.shift()
        } else {
          break
        }
      }
    }
  }

  isRunning () {
    return this.instances.size || this.locks.size
  }
}
