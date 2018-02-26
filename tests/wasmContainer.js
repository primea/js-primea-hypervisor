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
  getInterface (funcRef) {
    const orginal = super.getInterface(funcRef)
    return Object.assign(orginal, {
      test: {
        check: (a, b) => {
          tester.equals(a, b)
        }
      }
    })
  }
}

tape('basic', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('4494963fb0e02312510e675fbca8b60b6e03bd00', 'hex')
  }

  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync('./wasm/reciever.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const message = new Message({
    funcRef: module.getFuncRef('receive'),
    funcArguments: [5]
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  // t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('8c230b5f0f680199b24ecd1800c2970dfca7cfdc', 'hex')
  }

  const tree = new RadixTree({db})

  const recieverWasm = fs.readFileSync('./wasm/reciever.wasm')
  const callerWasm = fs.readFileSync('./wasm/caller.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module: receiverMod} = await hypervisor.createActor(TestWasmContainer.typeId, recieverWasm)
  const {module: callerMod} = await hypervisor.createActor(TestWasmContainer.typeId, callerWasm)
  const message = new Message({
    funcRef: callerMod.getFuncRef('call'),
    funcArguments: [receiverMod.getFuncRef('receive')]
  })

  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  // t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors with callback', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('9bf27cf07b75a90e0af530e2df73e3102482b24a', 'hex')
  }

  const tree = new RadixTree({
    db
  })

  const recieverWasm = fs.readFileSync('./wasm/funcRef_reciever.wasm')
  const callerWasm = fs.readFileSync('./wasm/funcRef_caller.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module: callerMod} = await hypervisor.createActor(TestWasmContainer.typeId, callerWasm)
  const {module: receiverMod} = await hypervisor.createActor(TestWasmContainer.typeId, recieverWasm)

  const message = new Message({
    funcRef: callerMod.getFuncRef('call'),
    funcArguments: [receiverMod.getFuncRef('receive')]
  })

  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  // t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('externalize/internalize memory', async t => {
  t.plan(1)
  tester = t
  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync('./wasm/memory.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const message = new Message({
    funcRef: module.getFuncRef('test')
  }).on('done', actor => {
    const a = actor.container.getMemory(0, 5)
    const b = actor.container.getMemory(5, 5)
    t.deepEquals(a, b, 'should copy memory correctly')
  })
  hypervisor.send(message)
})

tape('externalize/internalize table', async t => {
  t.plan(1)
  tester = t
  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync('./wasm/table.wasm')
  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const message = new Message({
    funcRef: module.getFuncRef('test')
  }).on('done', actor => {
    const a = actor.container.getMemory(0, 8)
    const b = actor.container.getMemory(8, 8)
    t.deepEquals(a, b, 'should copy memory correctly')
  })
  hypervisor.send(message)
})

tape.skip('store globals', async t => {
  t.plan(1)
  tester = t
  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync('./wasm/globals.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  await new Promise((resolve, reject) => {
    const message = new Message({
      funcRef: module.getFuncRef('store')
    }).on('done', actor => {
      resolve()
      // const a = actor.container.getMemory(0, 8)
      // const b = actor.container.getMemory(8, 8)
      // t.deepEquals(a, b, 'should copy memory correctly')
    })
    hypervisor.send(message)
  })

  await new Promise((resolve, reject) => {
    const message = new Message({
      funcRef: module.getFuncRef('load')
    }).on('done', actor => {
      resolve()
      // const a = actor.container.getMemory(0, 8)
      // const b = actor.container.getMemory(8, 8)
      // t.deepEquals(a, b, 'should copy memory correctly')
    })
    hypervisor.send(message)
  })
})
