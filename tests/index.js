const tape = require('tape')
const Message = require('../message.js')
const Hypervisor = require('../')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseContainer {
  static validate () {}
  static compile () {}
  static get typeId () {
    return 9
  }

  static exports (m, id) {
    return Object.keys(this.functions()).map(name => {
      return {
        name,
        destId: id
      }
    })
  }
  static instance (actor) {
    return {
      exports: this.functions(actor)
    }
  }
}

tape('basic', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('926de6b7eb39cfa8d7f8a44d1ef191d3bcb765a7', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainer extends BaseContainer {
    static functions () {
      return {
        onMessage: (m) => {
          t.true(m === 1, 'should recive a message')
        }
      }
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)

  let {exports} = await hypervisor.createActor(testVMContainer.typeId)

  const message = new Message({
    funcRef: exports[0],
    funcArguments: [1]
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('two communicating actors', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('a4c7ceacd8c867ae1d0b472d8bffa3cb10048331', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: (funcRef) => {
          const message = new Message({
            funcRef: funcRef,
            funcArguments: [2]
          })
          return actor.send(message)
        }
      }
    }
  }

  class testVMContainerB extends BaseContainer {
    static functions () {
      return {
        onMessage: (args) => {
          t.true(args === 2, 'should recive a message')
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {exports: exportsB} = await hypervisor.createActor(testVMContainerB.typeId)
  const {exports: exportsA} = await hypervisor.createActor(testVMContainerA.typeId)
  const message = new Message({
    funcRef: exportsA[0],
    funcArguments: [exportsB[0]]
  })

  await hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('4633ac4b9f8212e501b6c56906039ec081fbe5a3', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: (funcRef) => {
          const message = new Message({
            funcRef: funcRef,
            funcArguments: [2]
          })
          actor.send(message)
        }
      }
    }
  }

  class testVMContainerB extends BaseContainer {
    static functions () {
      return {
        onMessage: (arg) => {
          t.equals(arg, 2, 'should recive a message')
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {exports: exportsB} = await hypervisor.createActor(testVMContainerB.typeId)
  let {exports: exportsA0} = await hypervisor.createActor(testVMContainerA.typeId)
  let {exports: exportsA1} = await hypervisor.createActor(testVMContainerA.typeId)

  const message0 = new Message({
    funcRef: exportsA0[0],
    funcArguments: [exportsB[0]]
  })

  const message1 = new Message({
    funcRef: exportsA1[0],
    funcArguments: [exportsB[0]]
  })

  await hypervisor.send(message0)
  await hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('three communicating actors, with tick counting', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('4633ac4b9f8212e501b6c56906039ec081fbe5a3', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: funcRef => {
          actor.incrementTicks(1)
          const message = new Message({
            funcRef: funcRef,
            funcArguments: [2]
          })
          actor.send(message)
        }
      }
    }
  }

  class testVMContainerB extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: arg => {
          t.equals(arg, 2, 'should recive a message')
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let actorB = await hypervisor.createActor(testVMContainerB.typeId)
  let actorA0 = await hypervisor.createActor(testVMContainerA.typeId)
  let actorA1 = await hypervisor.createActor(testVMContainerA.typeId)

  const message0 = new Message({
    funcRef: actorA0.exports[0],
    funcArguments: [actorB.exports[0]]
  })

  const message1 = new Message({
    funcRef: actorA1.exports[0],
    funcArguments: actorB.exports
  })

  hypervisor.send(message0)
  hypervisor.send(message1)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('errors', async t => {
  t.plan(3)
  const expectedState = {
    '/': Buffer.from('a4c7ceacd8c867ae1d0b472d8bffa3cb10048331', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: funcRef => {
          const message = new Message({
            funcRef
          })
          message.on('execution:error', () => {
            t.pass('should recive a exeption')
          })
          actor.send(message)
        }
      }
    }
  }

  class testVMContainerB extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: funcRef => {
          t.true(true, 'should recive a message')
          throw new Error('test error')
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {exports: exportsB} = await hypervisor.createActor(testVMContainerB.typeId)
  let {exports: exportsA} = await hypervisor.createActor(testVMContainerA.typeId)
  const message = new Message({
    funcRef: exportsA[0],
    funcArguments: exportsB
  })
  hypervisor.send(message)
  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('actor creation', async t => {
  t.plan(2)
  const expectedState = {
    '/': Buffer.from('f47377a763c91247e62138408d706a09bccaaf36', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onCreation: async funcRef => {
          const {exports} = await actor.createActor(testVMContainerB.typeId)
          const message = new Message({
            funcRef: exports[0],
            funcArguments: [actor.getFuncRef('onMessage')]
          })
          actor.send(message)
        },
        onMessage: data => {
          t.equals(data, 'test', 'should recive a response message')
        }
      }
    }
  }

  class testVMContainerB extends BaseContainer {
    static functions (actor) {
      return {
        onCreation: funcRef => {
          actor.send(new Message({funcRef, funcArguments: ['test']}))
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {exports} = await hypervisor.createActor(testVMContainerA.typeId)
  await hypervisor.send(new Message({funcRef: exports[0]}))

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('simple message arbiter test', async t => {
  t.plan(4)
  const expectedState = {
    '/': Buffer.from('a4c7ceacd8c867ae1d0b472d8bffa3cb10048331', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onCreation: funcRef => {
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
          actor.send(message1)
          actor.incrementTicks(1)
          actor.send(message2)
          actor.incrementTicks(1)
          actor.send(message3)
        }
      }
    }
  }

  let recMsg = 0

  class testVMContainerB extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: data => {
          actor.incrementTicks(1)
          if (recMsg === 0) {
            t.equal(data, 'first', 'should recive fist message')
          } else if (recMsg === 1) {
            t.equal(data, 'second', 'should recive second message')
          } else {
            t.equal(data, 'third', 'should recive third message')
          }
          recMsg++
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  const {exports: exportsB} = await hypervisor.createActor(testVMContainerB.typeId)
  const {exports: exportsA} = await hypervisor.createActor(testVMContainerA.typeId)
  const message = new Message({
    funcRef: exportsA[0],
    funcArguments: exportsB
  })
  hypervisor.send(message)

  const stateRoot = await hypervisor.createStateRoot()
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('arbiter test for id comparision', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('4633ac4b9f8212e501b6c56906039ec081fbe5a3', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    static functions (actor) {
      return {
        onCreation: (funcRef, funcArguments) => {
          actor.incrementTicks(1)
          message = new Message({
            funcRef,
            funcArguments: [funcArguments]
          })
          return actor.send(message)
        }
      }
    }
  }

  let recMsg = 0

  class testVMContainerB extends BaseContainer {
    static functions (actor) {
      return {
        onMessage: data => {
          if (recMsg === 0) {
            t.equal(data, 'first', 'should recive fist message')
          } else if (recMsg === 1) {
            t.equal(data, 'second', 'should recive second message')
          } else {
            t.equal(data, 'third', 'should recive third message')
          }
          recMsg++
        }
      }
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let {exports: exportsB} = await hypervisor.createActor(testVMContainerB.typeId)
  hypervisor.send(new Message({
    funcRef: exportsB[0],
    funcArguments: ['first']
  }))

  const {exports: exportsA0} = await hypervisor.createActor(testVMContainerA.typeId)

  hypervisor.send(new Message({
    funcRef: exportsA0[0],
    funcArguments: [exportsB[0], 'second']
  }))

  const {exports: exportsA1} = await hypervisor.createActor(testVMContainerA.typeId)
  hypervisor.send(new Message({
    funcRef: exportsA1[0],
    funcArguments: [exportsB[0], 'third']
  }))

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
    static functions (actor) {
      return {
        onMessage: function () {
          const refs = [...arguments]
          const ref = refs.pop()
          const last = messageOrder[actor.id.toString('hex')]
          const message = actor.currentMessage
          if (last) {
            t.ok(last <= message._fromTicks)
          }
          messageOrder[actor.id.toString('hex')] = message._fromTicks
          numOfMsg++
          actor.incrementTicks(10)
          if (ref) {
            return actor.send(new Message({
              funcRef: ref,
              funcArguments: refs
            }))
          }
        }
      }
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(BenchmarkContainer)

  const refernces = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const {exports} = await hypervisor.createActor(BenchmarkContainer.typeId)
    refernces.push(exports[0])
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

  msgs.forEach(msg => hypervisor.send(msg))
  // console.log('here', numOfMsg)
  await hypervisor.scheduler.wait(Infinity)
  t.equals(numOfMsg, 110)
  t.end()
})
