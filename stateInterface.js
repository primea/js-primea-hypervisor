const assert = require('assert')

module.exports = class StateInterface {
  constructor (state) {
    assert(state, 'must have state')
    this.state = state
  }

  set (name, value) {
    this.state.set([name], value)
  }

  get (name) {
    return this.state.get([name])
  }

  del (name) {
    return this.state.del([name])
  }
}
