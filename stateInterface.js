module.exports = class StateInterface {
  constuctor (state) {
    this.state = state
  }

  set (name, value) {
    this.state.set([name], value)
  }

  get (name) {
    return this.state.get([name])
  }

  delete (name) {
    return this.state.del([name])
  }
}
