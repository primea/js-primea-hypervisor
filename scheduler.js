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

  update (instance) {
    this.instances.delete(instance.id)
    const instanceArray = [...this.instances]
    binarySearchInsert(instanceArray, comparator, [instance.id, {
      ticks: instance.ticks,
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

  wait (ticks, id) {
    if (!this.locks.size && ticks <= this.smallest()) {
      return
    } else {
      return new Promise((resolve, reject) => {
        binarySearchInsert(this._waits, comparator, {
          ticks: ticks,
          resolve: resolve,
          id: id
        })
      })
    }
  }

  smallest () {
    return [...this.instances][0][1].ticks
  }

  _checkWaits () {
    if (!this.locks.size) {
      if (!this.isRunning()) {
        // clear any remanding waits
        this._waits.forEach(wait => wait.resolve())
        this._waits = []
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
