const tape = require('tape')
const Hypervisor = require('../')
const errors = require('../errors.json')
const {Message, FunctionRef, ModuleRef} = require('primea-objects')

const level = require('level-browserify')
const EgressDriver = require('../egressDriver')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseContainer {
  constructor (actor) {
    this.actor = actor
  }
  onStartup () {}
  static onCreation (code, id) {
    const exp = {}
    Object.getOwnPropertyNames(this.prototype).filter(name => name !== 'constructor').forEach(name => {
      exp[name] = {}
    })
    return {
      actor: new ModuleRef(exp, id),
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

  class testVMContainer extends BaseContainer {
    store () {
      id = this.actor.id.id.toString('hex')
      mod = new ModuleRef({'test': ['i32', 'i64']}, this.actor.id)
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

  const hypervisor = new Hypervisor({tree, containers: [testVMContainer]})
  const actor = hypervisor.createActor(testVMContainer.typeId)
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
  t.plan(2)
  const expectedState = Buffer.from('32b919149345b74e431c42a1b7dd65c30c625284', 'hex')
  const tree = new RadixTree({
    db
  })

  class testVMContainer extends BaseContainer {
    main (m) {
      t.equals(m, 1, 'should recive a message')
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainer]})
  await hypervisor.createStateRoot()

  const actor = hypervisor.createActor(testVMContainer.typeId)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [1]
  })
  hypervisor.send(message)

  const stateRoot2 = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot2, expectedState, 'expected root!')
})

tape('two communicating actors', async t => {
  t.plan(2)
  const expectedState = Buffer.from('7f638e41261bc0238c3e9b34fce11827b6a3cb61', 'hex')

  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
      const message = new Message({
        funcRef,
        funcArguments: [2]
      })
      return this.actor.send(message)
    }
  }

  class testVMContainerB extends BaseContainer {
    main (args) {
      t.equals(args, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  const actorB = hypervisor.createActor(testVMContainerB.typeId)
  const actorA = hypervisor.createActor(testVMContainerA.typeId)

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
  const expectedState = Buffer.from('ae2e8afa84748192064ddebab30d0e9852ceb722', 'hex')
  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
      const message = new Message({
        funcRef: funcRef,
        funcArguments: [2]
      })
      this.actor.send(message)
    }
  }

  class testVMContainerB extends BaseContainer {
    main (arg) {
      t.equals(arg, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  let actorB = hypervisor.createActor(testVMContainerB.typeId)
  let actorA0 = hypervisor.createActor(testVMContainerA.typeId)
  let actorA1 = hypervisor.createActor(testVMContainerA.typeId)

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
  const expectedState = Buffer.from('ae2e8afa84748192064ddebab30d0e9852ceb722', 'hex')
  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
      this.actor.incrementTicks(1)
      const message = new Message({
        funcRef,
        funcArguments: [2]
      })
      this.actor.send(message)
    }
  }

  class testVMContainerB extends BaseContainer {
    main (arg) {
      t.equals(arg, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  let actorB = hypervisor.createActor(testVMContainerB.typeId)
  let actorA0 = hypervisor.createActor(testVMContainerA.typeId)
  let actorA1 = hypervisor.createActor(testVMContainerA.typeId)

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
  const expectedState = Buffer.from('7f638e41261bc0238c3e9b34fce11827b6a3cb61', 'hex')
  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
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

  class testVMContainerB extends BaseContainer {
    main (funcRef) {
      t.true(true, 'should recive a message')
      throw new Error('test error')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree})
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let actorB = hypervisor.createActor(testVMContainerB.typeId)
  let actorA = hypervisor.createActor(testVMContainerA.typeId)
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

  class testVMContainer extends BaseContainer {
    main (m) {
      this.actor.incrementTicks(1)
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainer]})
  await hypervisor.createStateRoot()

  const actor = hypervisor.createActor(testVMContainer.typeId)

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

  class testVMContainer extends BaseContainer {
    main (m) {
      this.actor.incrementTicks(1)
      t.pass('shouldnt meter')
    }
  }

  const hypervisor = new Hypervisor({
    tree,
    containers: [testVMContainer],
    meter: false
  })
  await hypervisor.createStateRoot()

  const actor = hypervisor.createActor(testVMContainer.typeId)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [1]
  })
  hypervisor.send(message)
})

tape('actor creation', async t => {
  t.plan(2)
  const expectedState = Buffer.from('0e6d32f2fe8b5b99f0203eb46bfc7e319a07f700', 'hex')

  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
    async start (funcRef) {
      const actor = this.actor.createActor(testVMContainerB.typeId)
      const message = new Message({
        funcRef: actor.getFuncRef('main'),
        funcArguments: [{
          identifier: [0, 'main'],
          actorID: this.actor.id
        }]
      })
      this.actor.send(message)
    }
    main (data) {
      t.equals(data, 'test', 'should recive a response message')
    }
  }

  class testVMContainerB extends BaseContainer {
    main (funcRef) {
      this.actor.send(new Message({funcRef, funcArguments: ['test']}))
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  const actor = hypervisor.createActor(testVMContainerA.typeId)
  await hypervisor.send(new Message({funcRef: actor.getFuncRef('start')}))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.end()
})

tape('simple message arbiter test', async t => {
  t.plan(4)
  const expectedState = Buffer.from('7f638e41261bc0238c3e9b34fce11827b6a3cb61', 'hex')
  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
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

  class testVMContainerB extends BaseContainer {
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

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  const actorB = hypervisor.createActor(testVMContainerB.typeId)
  const actorA = hypervisor.createActor(testVMContainerA.typeId)
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
  const expectedState = Buffer.from('ae2e8afa84748192064ddebab30d0e9852ceb722', 'hex')

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef, funcArguments) {
      message = new Message({
        funcRef,
        funcArguments: [funcArguments]
      })
      this.actor.send(message)
    }
  }

  let recMsg = 0

  class testVMContainerB extends BaseContainer {
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

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  let actorB = hypervisor.createActor(testVMContainerB.typeId)
  hypervisor.send(new Message({
    funcRef: actorB.getFuncRef('main'),
    funcArguments: ['first']
  }))

  const sr1 = await hypervisor.createStateRoot()

  const actorA0 = hypervisor.createActor(testVMContainerA.typeId)

  hypervisor.send(new Message({
    funcRef: actorA0.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main'), 'second']
  }))

  const actorA1 = hypervisor.createActor(testVMContainerA.typeId)
  hypervisor.send(new Message({
    funcRef: actorA1.getFuncRef('main'),
    funcArguments: [actorB.getFuncRef('main'), 'third']
  }))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')

  await hypervisor.setStateRoot(sr1)
  t.equals(hypervisor.nonce, 1, 'should get the correct nonce')
  t.end()
})

tape('async work', async t => {
  t.plan(3)
  const expectedState = Buffer.from('7f638e41261bc0238c3e9b34fce11827b6a3cb61', 'hex')

  const tree = new RadixTree({
    db
  })

  class testVMContainerA extends BaseContainer {
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

  class testVMContainerB extends BaseContainer {
    main (args) {
      this.actor.incrementTicks(1)
      t.equals(args, 2, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor({tree, containers: [testVMContainerA, testVMContainerB]})

  const actorB = hypervisor.createActor(testVMContainerB.typeId)
  const actorA = hypervisor.createActor(testVMContainerA.typeId)
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

  class testVMContainer extends BaseContainer {
    main (funcRef) {
      this.actor.send(new Message({
        funcRef,
        funcArguments: ['hello']
      }))
    }
  }

  const hypervisor = new Hypervisor({
    tree,
    containers: [testVMContainer],
    drivers: [egress]
  })
  const actor = hypervisor.createActor(testVMContainer.typeId)

  const message = new Message({
    funcRef: actor.getFuncRef('main'),
    funcArguments: [new FunctionRef({actorID: egress.id})]
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

  class BenchmarkContainer extends BaseContainer {
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
  hypervisor.registerContainer(BenchmarkContainer)

  const references = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const actor = hypervisor.createActor(BenchmarkContainer.typeId)
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
