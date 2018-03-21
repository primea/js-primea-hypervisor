const cbor = require('borc')

const TAGS = {
  id: 41,
  link: 42,
  func: 43,
  mod: 44
}

const DEFAULTS = {
  elem: [],
  data: Buffer.from([]),
  id: new cbor.Tagged(TAGS.id, 0),
  mod: new cbor.Tagged(TAGS.mod, [{}, new cbor.Tagged(TAGS.id, 0)]),
  link: {'/': null},
  func: new cbor.Tagged(TAGS.func, 0)
}

const decoder = new cbor.Decoder({
  tags: {
    [TAGS.id]: val => new ID(val),
    [TAGS.func]: val => new FunctionRef(...val),
    [TAGS.mod]: val => new ModuleRef(...val)
  }
})

class Serializable {
  serialize () {
    const encoder = new cbor.Encoder()
    this.encodeCBOR(encoder)
    return encoder.finalize()
  }

  static deserialize (serialized) {
    return decoder.decodeFirst(serialized)
  }
}

class FunctionRef extends Serializable {
  constructor (opts) {
    super()
    this.private = opts.private
    this.identifier = opts.identifier
    if (!(opts.id instanceof ID)) {
      opts.id = new ID(opts.id)
    }
    this.destId = opts.id
    this.params = opts.params
    this.gas = opts.gas
  }

  encodeCBOR (gen) {
    return gen.write(new cbor.Tagged(TAGS.func, [
      this.private,
      this.identifier,
      this.params,
      this.destId
    ]))
  }

  set container (container) {
    this._container = container
  }
}

class ModuleRef extends Serializable {
  constructor (ex, id) {
    super()
    this.exports = ex
    this.id = id
  }

  getFuncRef (name) {
    return new FunctionRef({
      private: false,
      identifier: name,
      params: this.exports[name],
      id: this.id
    })
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
}

class ID extends Serializable {
  constructor (id) {
    super()
    this.id = id
  }

  encodeCBOR (gen) {
    return gen.write(new cbor.Tagged(TAGS.id, this.id))
  }
}

module.exports = {
  ID,
  FunctionRef,
  ModuleRef,
  DEFAULTS
}
