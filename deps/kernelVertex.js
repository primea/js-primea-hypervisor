const Vertex = require('merkle-trie')

module.exports = class KernelVertex extends Vertex {
  get kernel () {
    return this._cache.kernel
  }

  set kernel (instance) {
    this._cache.kernel = instance
  }
}

