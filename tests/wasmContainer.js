const tape = require('tape')
const fs = require('fs')
const path = require('path')
const Message = require('../message.js')
const Hypervisor = require('../')
const WasmContainer = require('../wasmContainer.js')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

const WASM_PATH = path.join(__dirname, 'wasm')

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
        },
        print: (dataRef) => {
          let buf = this.refs.get(dataRef, 'buf')
          console.log(buf.toString())
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

  const wasm = fs.readFileSync(WASM_PATH + '/reciever.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)
  const funcRef = module.getFuncRef('receive')
  funcRef.gas = 300

  const message = new Message({
    funcRef,
    funcArguments: [5]
  }).on('execution:error', e => {
    console.log(e)
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  // t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('empty', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('bda5092c441e8d40c32eeeb69ce0e493f9d487cb', 'hex')
  }

  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync(WASM_PATH + '/empty.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)
  const funcRef = module.getFuncRef('receive')
  funcRef.gas = 300

  const message = new Message({
    funcRef,
    funcArguments: [5]
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('8c230b5f0f680199b24ecd1800c2970dfca7cfdc', 'hex')
  }

  const tree = new RadixTree({db})

  const recieverWasm = fs.readFileSync(WASM_PATH + '/reciever.wasm')
  const callerWasm = fs.readFileSync(WASM_PATH + '/caller.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module: receiverMod} = await hypervisor.createActor(TestWasmContainer.typeId, recieverWasm)
  const {module: callerMod} = await hypervisor.createActor(TestWasmContainer.typeId, callerWasm)
  const callFuncRef = callerMod.getFuncRef('call')
  const recvFuncRef = receiverMod.getFuncRef('receive')
  callFuncRef.gas = 100000
  recvFuncRef.gas = 1000
  const message = new Message({
    funcRef: callFuncRef,
    funcArguments: [recvFuncRef]
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

  const recieverWasm = fs.readFileSync(WASM_PATH + '/funcRef_reciever.wasm')
  const callerWasm = fs.readFileSync(WASM_PATH + '/funcRef_caller.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module: callerMod} = await hypervisor.createActor(TestWasmContainer.typeId, callerWasm)
  const {module: receiverMod} = await hypervisor.createActor(TestWasmContainer.typeId, recieverWasm)

  const callFuncRef = callerMod.getFuncRef('call')
  const recvFuncRef = receiverMod.getFuncRef('receive')
  callFuncRef.gas = 100000
  recvFuncRef.gas = 100000

  const message = new Message({
    funcRef: callFuncRef,
    funcArguments: [recvFuncRef]
  }).on('execution:error', e => console.log(e))

  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  // t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors with private callback', async t => {
  t.plan(1)
  tester = t
  const expectedState = {
    '/': Buffer.from('9bf27cf07b75a90e0af530e2df73e3102482b24a', 'hex')
  }

  const tree = new RadixTree({
    db
  })

  const recieverWasm = fs.readFileSync(WASM_PATH + '/funcRef_reciever.wasm')
  const callerWasm = fs.readFileSync(WASM_PATH + '/private_caller.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module: callerMod} = await hypervisor.createActor(TestWasmContainer.typeId, callerWasm)
  const {module: receiverMod} = await hypervisor.createActor(TestWasmContainer.typeId, recieverWasm)

  const callFuncRef = callerMod.getFuncRef('call')
  const recvFuncRef = receiverMod.getFuncRef('receive')
  callFuncRef.gas = 100000
  recvFuncRef.gas = 100000

  const message = new Message({
    funcRef: callFuncRef,
    funcArguments: [recvFuncRef]
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

  const wasm = fs.readFileSync(WASM_PATH + '/memory.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)
  const funcRef = module.getFuncRef('test')
  funcRef.gas = 10000

  const message = new Message({funcRef}).on('done', actor => {
    const a = actor.container.get8Memory(0, 5)
    const b = actor.container.get8Memory(5, 5)
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

  const wasm = fs.readFileSync(WASM_PATH + '/table.wasm')
  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  const funcRef = module.getFuncRef('test')
  funcRef.gas = 10000

  const message = new Message({funcRef}).on('done', actor => {
    const a = actor.container.get8Memory(0, 8)
    const b = actor.container.get8Memory(8, 8)
    t.deepEquals(a, b, 'should copy memory correctly')
  })
  hypervisor.send(message)
})

tape('load / store globals', async t => {
  t.plan(1)
  tester = t
  const tree = new RadixTree({
    db
  })

  const wasm = fs.readFileSync(WASM_PATH + '/globals.wasm')

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestWasmContainer)

  const {module} = await hypervisor.createActor(TestWasmContainer.typeId, wasm)

  await new Promise((resolve, reject) => {
    const funcRef = module.getFuncRef('store')
    funcRef.gas = 400
    const message = new Message({
      funcRef
    }).on('done', actor => {
      resolve()
    })
    hypervisor.send(message)
  })

  await new Promise((resolve, reject) => {
    const funcRef = module.getFuncRef('load')
    funcRef.gas = 400
    const message = new Message({
      funcRef
    }).on('done', actor => {
      const b = actor.container.get8Memory(5, 4)
      const result = Buffer.from(b).toString()
      t.deepEquals(result, 'test', 'should copy memory correctly')
      resolve()
    })
    hypervisor.send(message)
  })
})
