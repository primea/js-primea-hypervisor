const tape = require('tape')
const Hypervisor = require('../')
const errors = require('../errors.json')
const {Message, FunctionRef, ActorRef, ModuleRef} = require('primea-objects')

const level = require('level-browserify')
const EgressDriver = require('../egressDriver')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseModule {
  constructor (actor) {
    this.actor = actor
  }
  onStartup () {}
  static onCreation (code) {
    const exp = {}
    Object.getOwnPropertyNames(this.prototype).filter(name => name !== 'constructor').forEach(name => {
      exp[name] = {}
    })
    return {
      exports: exp,
      state: []
    }
  }
  onMessage (message) {
    return this[message.funcRef.identifier[1]](...message.funcArguments)
  }
  static get typeId () {
    return 9
  }
}

tape('system objects', async t => {
  t.plan(4)
  const tree = new RadixTree({
    db
  })

  let id
  let mod
  let funcref

  class TestModule extends BaseModule {
    store () {
      id = this.actor.id.id.toString('hex')
      const modRef = new ModuleRef(1, 1, {'test': ['i32', 'i64']})
      mod = new ActorRef(this.actor.id, modRef)
      funcref = mod.getFuncRef('test')
      this.actor.storage = [this.actor.id, {'/': 'test'}, mod, funcref]
    }
    load () {
      const loadedID = this.actor.storage[0].id.toString('hex')
      const link = this.actor.storage[1]
      const loadedMod = this.actor.storage[2]
      const loadedFuncref = this.actor.storage[3]
      t.equals(id, loadedID, 'should load id correctly')
      t.equals(link['/'].toString('hex'), '6fe3180f700090697285ac1e0e8dc400259373d7', 'should load link correctly')
      t.deepEquals(loadedMod, mod)
      t.deepEquals(funcref, loadedFuncref)
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModule]})
  const actor = hypervisor.newActor(TestModule)
  const message = new Message({
    funcRef: actor.getFuncRef('store')
  })

  hypervisor.send(message)
  await hypervisor.createStateRoot()

  const message2 = new Message({
    funcRef: actor.getFuncRef('load')
  })
  hypervisor.send(message2)
  await hypervisor.createStateRoot()
  t.end()
})

tape('basic', async t => {
  // t.plan(2)
  const expectedState = Buffer.from('be8e779df9d2ba23e5a6fcb3e551708cbc0fde82', 'hex')
  const tree = new RadixTree({
    db
  })

  class TestModule extends BaseModule {
    main (m) {
      t.equals(m, 1, 'should recive a message')
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModule]})
  await hypervisor.createStateRoot()

  const module = hypervisor.createModule(TestModule)
  const actor = hypervisor.createActor(module)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [1]
  })
  hypervisor.send(message)

  const stateRoot2 = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot2, expectedState, 'expected root!')
  t.end()
})

tape('two communicating actors', async t => {
  t.plan(2)
  const expectedState = Buffer.from('25bc7e81511bfded44a1846f4bca1acc99f24273', 'hex')

  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      const message = new Message({
        funcRef,
        funcArguments: [2]
      })
      return this.actor.send(message)
    }
  }

  class TestModuleB extends BaseModule {
    main (args) {
      t.equals(args, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({
    tree,
    modules: [TestModuleA, TestModuleB]
  })

  const actorB = hypervisor.newActor(TestModuleB)
  const actorA = hypervisor.newActor(TestModuleA)

  const message = new Message({
    funcRef: actorA.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main')]
  })

  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors', async t => {
  t.plan(3)
  const expectedState = Buffer.from('862f3393675dd33fb7e9b93b43aac7a9131ef665', 'hex')
  const tree = new RadixTree({
    db: db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      const message = new Message({
        funcRef: funcRef,
        funcArguments: [2]
      })
      this.actor.send(message)
    }
  }

  class TestModuleB extends BaseModule {
    main (arg) {
      t.equals(arg, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  let actorB = hypervisor.newActor(TestModuleB)
  let actorA0 = hypervisor.newActor(TestModuleA)
  let actorA1 = hypervisor.newActor(TestModuleA)

  const message0 = new Message({
    funcRef: actorA0.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main')]
  })

  const message1 = new Message({
    funcRef: actorA1.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main')]
  })

  await hypervisor.send(message0)
  await hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors, with tick counting', async t => {
  t.plan(3)
  const expectedState = Buffer.from('862f3393675dd33fb7e9b93b43aac7a9131ef665', 'hex')
  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      this.actor.incrementTicks(1)
      const message = new Message({
        funcRef,
        funcArguments: [2]
      })
      this.actor.send(message)
    }
  }

  class TestModuleB extends BaseModule {
    main (arg) {
      t.equals(arg, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  let actorB = hypervisor.newActor(TestModuleB)
  let actorA0 = hypervisor.newActor(TestModuleA)
  let actorA1 = hypervisor.newActor(TestModuleA)

  const funcRef0 = actorA0.getFuncRef('main')
  funcRef0.gas = 10000

  const message0 = new Message({
    funcRef: funcRef0,
    funcArguments: [actorB.getFuncRef('main')]
  })
  const funcRef1 = actorA1.getFuncRef('main')
  funcRef1.gas = 10000
  const message1 = new Message({
    funcRef: funcRef1,
    funcArguments: [actorB.getFuncRef('main')]
  })

  hypervisor.send(message0)
  hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('errors', async t => {
  t.plan(3)
  const expectedState = Buffer.from('25bc7e81511bfded44a1846f4bca1acc99f24273', 'hex')
  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      const message = new Message({
        funcRef
      })
      message.on('execution:error', () => {
        t.pass('should recive a exeption')
      })
      this.actor.send(message)
    }
  }

  class TestModuleB extends BaseModule {
    main (funcRef) {
      t.true(true, 'should recive a message')
      throw new Error('test error')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleB, TestModuleA]})

  let actorB = hypervisor.newActor(TestModuleB)
  let actorA = hypervisor.newActor(TestModuleA)
  const message = new Message({
    funcRef: actorA.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main')]
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('out-of-gas', async t => {
  t.plan(1)
  const tree = new RadixTree({
    db
  })

  class testVMContainer extends BaseModule {
    main (m) {
      this.actor.incrementTicks(1)
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [testVMContainer]})
  await hypervisor.createStateRoot()

  const actor = hypervisor.newActor(testVMContainer)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [1]
  }).on('execution:error', e => {
    t.equals(e.message, errors.OUT_OF_GAS)
  })
  hypervisor.send(message)
})

tape('no mettering', async t => {
  t.plan(1)
  const tree = new RadixTree({
    db
  })

  class testVMContainer extends BaseModule {
    main (m) {
      this.actor.incrementTicks(1)
      t.pass('shouldnt meter')
    }
  }

  const hypervisor = new Hypervisor({
    tree,
    modules: [testVMContainer],
    meter: false
  })
  await hypervisor.createStateRoot()

  const actor = hypervisor.newActor(testVMContainer)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [1]
  })
  hypervisor.send(message)
})

tape('actor creation', async t => {
  t.plan(2)
  const expectedState = Buffer.from('007c3ef07195d2c3959f22f1d2719ed4f4e4193a', 'hex')

  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    async start (funcRef) {
      const actor = this.actor.newActor(TestModuleB)
      const message = new Message({
        funcRef: actor.getFuncRef('main'),
        funcArguments: [{
          identifier: [0, 'main'],
          actorId: this.actor.id
        }]
      })
      this.actor.send(message)
    }
    main (data) {
      t.equals(data, 'test', 'should recive a response message')
    }
  }

  class TestModuleB extends BaseModule {
    main (funcRef) {
      this.actor.send(new Message({funcRef, funcArguments: ['test']}))
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  const actor = hypervisor.newActor(TestModuleA)
  await hypervisor.send(new Message({funcRef: actor.getFuncRef('start')}))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.end()
})

tape('simple message arbiter test', async t => {
  t.plan(4)
  const expectedState = Buffer.from('25bc7e81511bfded44a1846f4bca1acc99f24273', 'hex')
  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      funcRef.gas = 1000
      const message1 = new Message({
        funcArguments: ['first'],
        funcRef
      })
      const message2 = new Message({
        funcArguments: ['second'],
        funcRef
      })
      const message3 = new Message({
        funcArguments: ['third'],
        funcRef
      })
      this.actor.send(message1)
      this.actor.incrementTicks(1)
      this.actor.send(message2)
      this.actor.incrementTicks(1)
      this.actor.send(message3)
    }
  }

  let recMsg = 0

  class TestModuleB extends BaseModule {
    main (data) {
      this.actor.incrementTicks(1)
      if (recMsg === 0) {
        t.equal(data, 'first', 'should recive fist message')
      } else if (recMsg === 1) {
        t.equal(data, 'second', 'should recive second message')
      } else {
        t.equal(data, 'third', 'should recive third message')
      }
      recMsg++
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  const actorB = hypervisor.newActor(TestModuleB)
  const actorA = hypervisor.newActor(TestModuleA)
  const funcRef = actorA.getFuncRef('main')
  funcRef.gas = 4000

  const message = new Message({
    funcRef,
    funcArguments: [actorB.getFuncRef('main')]
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('arbiter test for id comparision', async t => {
  t.plan(5)
  let message
  const expectedState = Buffer.from('862f3393675dd33fb7e9b93b43aac7a9131ef665', 'hex')

  const tree = new RadixTree({
    db: db
  })

  class TestModuleA extends BaseModule {
    main (funcRef, funcArguments) {
      message = new Message({
        funcRef,
        funcArguments: [funcArguments]
      })
      this.actor.send(message)
    }
  }

  let recMsg = 0

  class TestModuleB extends BaseModule {
    main (data) {
      if (recMsg === 0) {
        t.equal(data, 'first', 'should recive fist message')
      } else if (recMsg === 1) {
        t.equal(data, 'second', 'should recive second message')
      } else {
        t.equal(data, 'third', 'should recive third message')
      }
      recMsg++
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  let actorB = hypervisor.newActor(TestModuleB)
  hypervisor.send(new Message({
    funcRef: actorB.getFuncRef('main'),
    funcArguments: ['first']
  }))

  const sr1 = await hypervisor.createStateRoot()

  const actorA1 = hypervisor.newActor(TestModuleA)
  const actorA0 = hypervisor.newActor(TestModuleA)

  hypervisor.send(new Message({
    funcRef: actorA0.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main'), 'second']
  }))

  hypervisor.send(new Message({
    funcRef: actorA1.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main'), 'third']
  }))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')

  await hypervisor.setStateRoot(sr1)
  t.equals(hypervisor.nonce, 2, 'should get the correct nonce')
  t.end()
})

tape('async work', async t => {
  t.plan(3)
  const expectedState = Buffer.from('25bc7e81511bfded44a1846f4bca1acc99f24273', 'hex')

  const tree = new RadixTree({
    db
  })

  class TestModuleA extends BaseModule {
    main (funcRef) {
      funcRef.gas = 10
      const message = new Message({
        funcRef,
        funcArguments: [2]
      })
      this.actor.send(message)

      const message2 = new Message({
        funcRef,
        funcArguments: [2]
      })
      this.actor.send(message2)
      this.actor.incrementTicks(1)
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve()
        }, 10)
      })
    }
  }

  class TestModuleB extends BaseModule {
    main (args) {
      this.actor.incrementTicks(1)
      t.equals(args, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, modules: [TestModuleA, TestModuleB]})

  const actorB = hypervisor.newActor(TestModuleB)
  const actorA = hypervisor.newActor(TestModuleA)
  const funcRef = actorA.getFuncRef('main')
  funcRef.gas = 200

  const message = new Message({
    funcRef,
    funcArguments: [actorB.getFuncRef('main')]
  })

  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('driver', async t => {
  const tree = new RadixTree({
    db
  })

  const egress = new EgressDriver()

  egress.on('message', msg => {
    t.equals(msg.funcArguments[0], 'hello')
    t.end()
  })

  class testVMContainer extends BaseModule {
    main (funcRef) {
      this.actor.send(new Message({
        funcRef,
        funcArguments: ['hello']
      }))
    }
  }

  const hypervisor = new Hypervisor({
    tree,
    modules: [testVMContainer],
    drivers: [egress]
  })
  const actor = hypervisor.newActor(testVMContainer)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [new FunctionRef({actorId: egress.id})]
  })

  hypervisor.send(message)
})

tape('random', async t => {
  const numOfActors = 10
  const depth = 10
  const messageOrder = {}
  let numOfMsg = 0
  const tree = new RadixTree({
    db
  })

  class BenchmarkContainer extends BaseModule {
    main () {
      const refs = [...arguments]
      const ref = refs.pop()
      const last = messageOrder[this.actor.id.id.toString('hex')]
      const message = this.actor.currentMessage
      if (last !== undefined) {
        t.ok(last <= message._fromTicks, 'message should be in correct order')
      }
      messageOrder[this.actor.id.id.toString('hex')] = message._fromTicks
      numOfMsg++

      this.actor.incrementTicks(10)
      if (ref) {
        ref.gas = this.actor.currentMessage.funcRef.gas
        this.actor.send(new Message({
          funcRef: ref,
          funcArguments: refs
        }))
      }
    }
  }

  const hypervisor = new Hypervisor({tree})
  hypervisor.registerModule(BenchmarkContainer)

  const references = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const actor = hypervisor.newActor(BenchmarkContainer)
    const funcRef = actor.getFuncRef('main')
    references.push(funcRef)
  }
  _numOfActors = numOfActors
  const msgs = []
  while (_numOfActors--) {
    let _depth = depth
    const funcArguments = []
    while (_depth--) {
      const r = Math.floor(Math.random() * numOfActors)
      const ref = references[r].copy()
      funcArguments.push(ref)
    }
    const funcRef = references[_numOfActors]
    funcRef.gas = 1000000

    const message = new Message({
      funcArguments,
      funcRef
    })
    msgs.push(message)
  }

  hypervisor.send(msgs)
  await hypervisor.scheduler.on('idle', () => {
    t.equals(numOfMsg, depth * numOfActors + numOfActors)
    t.end()
  })
})
