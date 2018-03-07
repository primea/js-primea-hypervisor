const cbor = require('borc')

const TAGS = {
  link: 42,
  id: 43,
  func: 43,
  mod: 44
}

const DEFAULTS = {
  elem: [],
  buf: Buffer.from([]),
  id: new cbor.Tagged(TAGS.id, 0),
  mod: new cbor.Tagged(TAGS.mod, [{}, new cbor.Tagged(TAGS.id, 0)]),
  link: {'/': null},
  func: new cbor.Tagged(TAGS.func, 0)
}

class FunctionRef {
  constructor (privateFunc, identifier, params, id, gas=0) {
    this.private = privateFunc
    this.identifier = identifier
    this.destId = id
    this.params = params
    this.gas = gas
  }

  encodeCBOR (gen) {
    return gen.write(new cbor.Tagged(TAGS.func, [
      this.private,
      this.identifier,
      this.destId,
      this.params
    ]))
  }

  set container (container) {
    this._container = container
  }
}

class ModuleRef {
  constructor (ex, id) {
    this.exports = ex
    this.id = id
  }

  getFuncRef (name) {
    return new FunctionRef(false, name, this.exports[name], this.id)
  }

  encodeCBOR (gen) {
    return gen.write(new cbor.Tagged(TAGS.mod, [this.exports, this.id]))
  }

  static fromMetaJSON (json, id) {
    const exports = {}
    for (const ex in json.exports) {
      const type = json.types[json.indexes[json.exports[ex].toString()]].params
      exports[ex] = type
    }
    return new ModuleRef(exports, id)
  }

  static deserialize (serialized) {}
}

class ID {
  constructor (id) {
    this.id = id
  }

  encodeCBOR (gen) {
    return gen.write(cbor.Tagged(TAGS.id, this.id))
  }
}

module.exports = {
  ID,
  FunctionRef,
  ModuleRef,
  DEFAULTS
}
