const tape = require('tape')
const fs = require('fs')
const Message = require('../message.js')
const Hypervisor = require('../')
const WasmContainer = require('../wasmContainer.js')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

let tester

class TestWasmContainer extends WasmContainer {
  constructor (actor) {
    super(actor)
    this._storage = new Map()
  }
  getInteface (funcRef) {
    const orginal = super.getInteface(funcRef)
    return Object.assign(orginal, {
      test: {
        check: (a, b) => {
          tester.equals(a, b)
        }
      }
    })
  }
  setState (key, ref) {
    const obj = this.refs.get(ref)
    this._storage.set(key, obj)
  }
  getState (key) {
    const obj = this._storage.get(key)
    return this.refs.add(obj)
  }
}

tape('basic', async t => {
  t.plan(2)
  tester = t
  const expectedState = {
    '/': Buffer.from('926de6b7eb39cfa8d7f8a44d1ef191d3bcb765a7', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  const wasm = fs.readFileSync('./wasm/reciever.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {exports} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const message = new Message({
    funcRef: exports.receive,
    funcArguments: [5]
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

// Increment a counter.
tape('increment', async t => {

  const tree = new RadixTree({
    db: db
  })

  const wasm = fs.readFileSync('./wasm/counter.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {exports} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const message = new Message({
    funcRef: exports.increment,
    funcArguments: []
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.end()

  console.log(stateRoot)

})