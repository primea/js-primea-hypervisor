const tape = require('tape')
const AbstractContainer = require('primea-abstract-container')
const Message = require('primea-message')
const Hypervisor = require('../')
const CapsManager = require('../capsManager.js')

const level = require('level')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseContainer extends AbstractContainer {
  onCreation () {}
  static get typeId () {
    return 9
  }
}

tape('basic', async t => {
  t.plan(3)
  let message
  const expectedState = {
    '/': Buffer.from('70a9676b7995b108057bd29955e3874401aa5ba7', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainer extends BaseContainer {
    onMessage (m, tag) {
      t.true(m === message, 'should recive a message')
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)

  let rootCap = await hypervisor.createInstance(testVMContainer.typeId, new Message())

  message = new Message()
  hypervisor.send(rootCap, message)

  const stateRoot = await hypervisor.createStateRoot(Infinity)
  t.deepEquals(stateRoot, expectedState, 'expected root!')

  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('caps manager', async t => {
  const capsManager = new CapsManager({})
  const cap = {}
  capsManager.store('test', cap)
  const c = capsManager.get('test')
  t.equals(cap, c)
  capsManager.delete('test')
  const empty = capsManager.get('test')
  t.equals(empty, undefined)
  t.end()
})

tape('two communicating actors', async t => {
  t.plan(3)
  let message
  const expectedState = {
    '/': Buffer.from('fc935489953ed357f06171dd23439d83190b3a1b', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    onCreation (m) {
      message = new Message()
      return this.kernel.send(m.caps[0], message)
    }
  }

  class testVMContainerB extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let capB = await hypervisor.createInstance(testVMContainerB.typeId, new Message())
  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('three communicating actors', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('24855a8efa9af536f0f9b319c05b10d6b7cae6c8', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    onCreation (m) {
      message = new Message()
      return this.kernel.send(m.caps[0], message)
    }
  }

  class testVMContainerB extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let capB = await hypervisor.createInstance(testVMContainerB.typeId, new Message())
  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('three communicating actors, with tick counting', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('24855a8efa9af536f0f9b319c05b10d6b7cae6c8', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  let ticks = 1

  class testVMContainerA extends BaseContainer {
    async onCreation (m) {
      this.kernel.incrementTicks(ticks)
      ticks++
      message = new Message()
      await this.kernel.send(m.caps[0], message)
    }
  }

  class testVMContainerB extends BaseContainer {
    onMessage (m) {
      t.true(m, 'should recive a message')
      return new Promise((resolve, reject) => {
        setTimeout(resolve, 200)
      })
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let capB = await hypervisor.createInstance(testVMContainerB.typeId, new Message())
  hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('response caps', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('fc935489953ed357f06171dd23439d83190b3a1b', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    onCreation (m) {
      message = new Message()
      message.responseCap = this.kernel.mintCap()
      return this.kernel.send(m.caps[0], message)
    }

    onMessage (m) {
      t.true(m, 'should recive a response message')
    }
  }

  class testVMContainerB extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let capB = await hypervisor.createInstance(testVMContainerB.typeId, new Message())
  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('response caps for errors', async t => {
  t.plan(4)
  let message
  const expectedState = {
    '/': Buffer.from('fc935489953ed357f06171dd23439d83190b3a1b', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    onCreation (m) {
      message = new Message()
      message.responseCap = this.kernel.mintCap()
      return this.kernel.send(m.caps[0], message)
    }

    onMessage (m) {
      t.true(m.data.exceptionError instanceof Error, 'should recive a response message')
    }
  }

  class testVMContainerB extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
      throw new Error('test error')
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  let capB = await hypervisor.createInstance(testVMContainerB.typeId, new Message())
  await hypervisor.createInstance(testVMContainerA.typeId, new Message({
    caps: [capB]
  }))

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('actor creation', async t => {
  t.plan(3)
  let message
  const expectedState = {
    '/': Buffer.from('8e809b10d473ef4592dc5c1683e89bc7001e5e3e', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainerA extends BaseContainer {
    onCreation (m) {
      message = new Message()
      const cap = this.kernel.mintCap()
      message.caps.push(cap)
      return this.kernel.createInstance(testVMContainerB.typeId, message)
    }

    onMessage (m) {
      t.true(m, 'should recive a response message')
    }
  }

  class testVMContainerB extends BaseContainer {
    onCreation (m) {
      const cap = m.caps[0]
      return this.kernel.send(cap, new Message())
    }

    onMessage (m) {
    }

    static get typeId () {
      return 8
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainerA)
  hypervisor.registerContainer(testVMContainerB)

  await hypervisor.createInstance(testVMContainerA.typeId, new Message())

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  t.deepEquals(stateRoot, expectedState, 'expected root!')
  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

