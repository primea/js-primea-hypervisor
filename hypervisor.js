const Kernel = require('./index.js')
const Vertex = require('merkle-trie')
// const Block = require('./deps/block.js')
// const blockchain = require('./fakeBlockChain.js')
const codeHandlers = require('./codeHandler.js')

module.exports = class Hypervisor {
  constructor (state = new Vertex(), imports = []) {
    this.state = state
    this.root = new Kernel({
      imports: imports,
      state: state
    })
  }

  set (path, kernel) {
    this.state.set(path, new Vertex({
      value: kernel
    }))
  }

  send (message) {
    return this.root.send(message)
  }

  addVM (type, handler) {
    codeHandlers.handlers.type = handler
  }
}
