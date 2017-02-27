const Kernel = require('./index.js')
const Vertex = require('merkle-trie')
const Block = require('./deps/block.js')
const blockchain = require('./fakeBlockChain.js')
const codeHandlers = require('./codeHandler.js')

module.exports = class Hypervisor {
  constructor (state = new Vertex()) {
    this.state = state
    if (state.isEmpty) {
      state.set('block', new Vertex({
        value: new Block()
      }))
      state.set('blockchain', new Vertex({
        value: blockchain
      }))
    }
    this.root = new Kernel({
      state: state
    })
  }

  set (path, kernel) {
    this.state.set(path, new Vertex({
      value: kernel
    }))
  }

  send (message) {
    this.root.send(message)
    return message.result()
  }

  async get (path) {
    let lastKernel = this.root
    let state = this.state
    while (path.length) {
      const name = path.unshift()
      state = await state.get(name)
      const kernel = new Kernel({
        state: state,
        parent: lastKernel
      })
      lastKernel = kernel
    }
    return lastKernel
  }

  addVM (type, handler) {
    codeHandlers.handlers.type = handler
  }
}
