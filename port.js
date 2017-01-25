const Cache = require('imperative-trie')
const common = require('./common')

module.exports = class Port {
  constructor (state, constructor) {
    this.state = state
    this.Kernel = constructor
    this.cache = new Cache()
  }

  async send (name, message) {
    if (name === common.PARENT) {
      message.from.push(this.state.name)
    } else {
      message.from.push(common.PARENT)
    }

    const dest = await this.get(name)
    return dest.recieve(message)
  }

  async get (name) {
    // console.log(name)
    const vertex = name === common.PARENT ? this.cache.parent : this.cache.get(name)

    if (vertex) {
      return vertex.value
    } else {
      // console.log(this.state.path)
      const destState = await (
        name === common.PARENT
        ? this.state.getParent()
        : this.state.get([name]))

      const kernel = new this.Kernel({
        state: destState
      })

      const cache = new Cache(kernel)

      kernel.ports.cache = cache
      if (name === common.PARENT) {
        cache.set(this.state.name, this.cache)
      } else {
        this.cache.set(name, cache)
      }
      return kernel
    }
  }
}
