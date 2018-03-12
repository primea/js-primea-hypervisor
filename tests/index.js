const tape = require('tape')
const Message = require('../message.js')
const Hypervisor = require('../')

const level = require('level-browserify')
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
      exp[name] = {
        name,
        destId: id
      }
    })
    return exp
  }
  onMessage (message) {
    return this[message.funcRef.name](...message.funcArguments)
  }
  static get typeId () {
    return 9
  }
}

tape('basic', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('cd80335de00c2bf38570b41c55a79174c1c64e9f', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainer extends BaseContainer {
    main (m) {
      t.equals(m, 1, 'should recive a message')
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)

  const {module} = hypervisor.createActor(testVMContainer.typeId)

  const message = new Message({
    funcRef: module.main,
    funcArguments: [1]
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('b063f3e53b2ea40f50afe964b9f9b49aad491155', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
      const message = new Message({
        funcRef: funcRef,
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  const {module: moduleA} = hypervisor.createActor(testVMContainerA.typeId)

  const message = new Message({
    funcRef: moduleA.main,
    funcArguments: [moduleB.main]
  })

  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('db532195ac569b142415cc9bdbec37f18f344a59', 'hex')
  }

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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  let {module: moduleA0} = hypervisor.createActor(testVMContainerA.typeId)
  let {module: moduleA1} = hypervisor.createActor(testVMContainerA.typeId)

  const message0 = new Message({
    funcRef: moduleA0.main,
    funcArguments: [moduleB.main]
  })

  const message1 = new Message({
    funcRef: moduleA1.main,
    funcArguments: [moduleB.main]
  })

  await hypervisor.send(message0)
  await hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors, with tick counting', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('db532195ac569b142415cc9bdbec37f18f344a59', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
      this.actor.incrementTicks(1)
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let actorB = hypervisor.createActor(testVMContainerB.typeId)
  let actorA0 = hypervisor.createActor(testVMContainerA.typeId)
  let actorA1 = hypervisor.createActor(testVMContainerA.typeId)

  const message0 = new Message({
    funcRef: actorA0.module.main,
    funcArguments: [actorB.module.main]
  })
  const message1 = new Message({
    funcRef: actorA1.module.main,
    funcArguments: [actorB.module.main]
  })

  hypervisor.send(message0)
  hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('errors', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('b063f3e53b2ea40f50afe964b9f9b49aad491155', 'hex')
  }

  const tree = new RadixTree({
    db: db
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  let {module: moduleA} = hypervisor.createActor(testVMContainerA.typeId)
  const message = new Message({
    funcRef: moduleA.main,
    funcArguments: [moduleB.main]
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('actor creation', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('8a21d80cd7ca04e64be7cb2726a72060fc546ed6', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    async start (funcRef) {
      const {module} = this.actor.createActor(testVMContainerB.typeId)
      const message = new Message({
        funcRef: module.main,
        funcArguments: [{
          name: 'main',
          destId: this.actor.id
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {module} = hypervisor.createActor(testVMContainerA.typeId)
  await hypervisor.send(new Message({funcRef: module.start}))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.end()
})

tape('simple message arbiter test', async t => {
  t.plan(4)
  const expectedState = {
    '/': Buffer.from('b063f3e53b2ea40f50afe964b9f9b49aad491155', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef) {
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  const {module: moduleA} = hypervisor.createActor(testVMContainerA.typeId)
  const message = new Message({
    funcRef: moduleA.main,
    funcArguments: [moduleB.main]
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('arbiter test for id comparision', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('db532195ac569b142415cc9bdbec37f18f344a59', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    main (funcRef, funcArguments) {
      this.actor.incrementTicks(1)
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  hypervisor.send(new Message({
    funcRef: moduleB.main,
    funcArguments: ['first']
  }))

  const {module: moduleA0} = hypervisor.createActor(testVMContainerA.typeId)

  hypervisor.send(new Message({
    funcRef: moduleA0.main,
    funcArguments: [moduleB.main, 'second']
  }))

  const {module: moduleA1} = hypervisor.createActor(testVMContainerA.typeId)
  hypervisor.send(new Message({
    funcRef: moduleA1.main,
    funcArguments: [moduleB.main, 'third']
  }))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('async work', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('b063f3e53b2ea40f50afe964b9f9b49aad491155', 'hex')
  }

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

      const message2 = new Message({
        funcRef: funcRef,
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

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {module: moduleB} = hypervisor.createActor(testVMContainerB.typeId)
  const {module: moduleA} = hypervisor.createActor(testVMContainerA.typeId)

  const message = new Message({
    funcRef: moduleA.main,
    funcArguments: [moduleB.main]
  })

  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('random', async t => {
  const numOfActors = 10
  const depth = 10
  const messageOrder = {}
  let numOfMsg = 0
  const tree = new RadixTree({
    db: db
  })

  class BenchmarkContainer extends BaseContainer {
    main () {
      const refs = [...arguments]
      const ref = refs.pop()
      const last = messageOrder[this.actor.id.toString('hex')]
      const message = this.actor.currentMessage
      if (last) {
        t.ok(last <= message._fromTicks)
      }
      messageOrder[this.actor.id.toString('hex')] = message._fromTicks
      numOfMsg++
      this.actor.incrementTicks(10)
      if (ref) {
        this.actor.send(new Message({
          funcRef: ref,
          funcArguments: refs
        }))
      }
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(BenchmarkContainer)

  const refernces = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const {module} = hypervisor.createActor(BenchmarkContainer.typeId)
    refernces.push(module.main)
  }
  _numOfActors = numOfActors
  let msgs = []
  while (_numOfActors--) {
    let _depth = depth
    const funcArguments = []
    while (_depth--) {
      const r = Math.floor(Math.random() * numOfActors)
      const ref = refernces[r]
      funcArguments.push(ref)
    }
    const message = new Message({
      funcArguments,
      funcRef: refernces[_numOfActors]
    })
    msgs.push(message)
  }

  hypervisor.send(msgs)
  await hypervisor.scheduler.on('idle', () => {
    t.equals(numOfMsg, 110)
    t.end()
  })
})
