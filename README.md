# SYNOPSIS

[![NPM Package](https://img.shields.io/npm/v/primea-hypervisor.svg?style=flat-square)](https://www.npmjs.org/package/primea-hypervisor)
[![Build Status](https://img.shields.io/travis/primea/js-primea-hypervisor.svg?branch=master&style=flat-square)](https://travis-ci.org/primea/js-primea-hypervisor)
[![Coverage Status](https://img.shields.io/coveralls/primea/js-primea-hypervisor.svg?style=flat-square)](https://coveralls.io/r/primea/js-primea-hypervisor)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)  

A JavaScript Implementation of Primea HyperVisor

# INSTALL
clone and run `npm install`

# USAGE
```javascript

const Hypervisor = require('primea-hypervisor')
const {Message, FunctionRef} = require('primea-objects')
const WasmContainer = require('primea-wasm-container')

// setup presistant state
const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level(`${__dirname}/db`)
const tree = new RadixTree({db})

const hypervisor = new Hypervisor({tree, containers: [WasmContainer]})

const wasm // a webassembly binary with an exported function named "main"

// create an actor with a webassembly container
const {module} = hypervisor.createActor(WasmContainer.typeId, wasm)

// create message to send to the actor that was just created
const message = new Message({
  funcRef: module.getFuncRef('main'),
  funcArguments: [new FunctionRef({
    actorID: egress.id,
    params: ['data']
  })]
}).on('execution:error', e => console.error(e))

hypervisor.send(message)

// write everything to the db can create a merkle tree with a single state root
const sr = await hypervisor.createStateRoot()
console.log('state root:', sr.toString('hex'))
```

# API
[./docs](./docs/index.md)

# DESIGN
Primea is an [actor based system](https://en.wikipedia.org/wiki/Actor_model) with [capabilities](https://en.wikipedia.org/wiki/Capability-based_security).
Its high level goals are

* Performant IPC
* Extensible, allowing for upgrades and customization
* Interoperability with existing codebases
* Deterministic execution

# LICENSE
[MPL-2.0][LICENSE]

[LICENSE]: https://tldrlegal.com/license/mozilla-public-license-2.0-(mpl-2)
