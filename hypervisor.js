const Kernel = require('./index.js')
const codeHandlers = require('./codeHandler.js')

module.exports = class Hypervisor {
  constructor (graph, state, imports = []) {
    this.state = state
    this.graph = graph
    this.root = new Kernel({
      imports: imports,
      graph: graph,
      state: state
    })
  }

  set (path, value) {
    return this.graph.set(this.state, path, value)
  }

  send (message) {
    return this.root.send(message)
  }

  addVM (type, handler) {
    codeHandlers.handlers.type = handler
  }
}
