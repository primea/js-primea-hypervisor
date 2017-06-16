const binarySearchInsert = require('binary-search-insert')

const comparator = function (a, b) {
  return a.ticks - b.ticks
}

module.exports = class Scheduler {
  constructor () {
    this._waits = []
    this.instances = new Map()
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

  done (instance) {
    this.instances.delete(instance.id)
    if (this.instances.size) {
      this._checkWaits()
    } else {
      // clear any remanding waits
      this._waits.forEach(wait => {
        wait.resolve()
      })
      this._waits = []
    }
  }

  wait (ticks) {
    if (ticks <= this.oldest()) {
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
