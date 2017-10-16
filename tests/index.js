const tape = require('tape')
const AbstractContainer = require('primea-abstract-container')
const Message = require('primea-message')
const Hypervisor = require('../')

const level = require('level')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseContainer extends AbstractContainer {
  onCreation (message) {
    const port = message.ports[0]
    if (port) {
      return this.kernel.ports.bind('root', port)
    }
  }
  static get typeId () {
    return 9
  }
}

tape('basic', async t => {
  t.plan(3)
  let message
  const expectedState = {
    '/': Buffer.from('646e7b89a3a4bb5dd6d43d1a7a29c69e72943bcd', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })

  class testVMContainer extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)

  const port = hypervisor.creationService.getPort()

  let rootContainer = await hypervisor.send(port, new Message({
    data: {
      type: testVMContainer.typeId
    }
  }))

  rootContainer = await hypervisor.getInstance(rootContainer.id)

  hypervisor.pin(rootContainer)

  const [portRef1, portRef2] = rootContainer.ports.createChannel()
  const initMessage = rootContainer.createMessage({
    data: {
      code: Buffer.from('test code'),
      type: testVMContainer.typeId
    },
    ports: [portRef2]
  })

  message = rootContainer.createMessage()
  await Promise.all([
    rootContainer.send(port, initMessage),
    rootContainer.ports.bind('first', portRef1),
    rootContainer.send(portRef1, message)
  ])
  rootContainer.shutdown()

  const stateRoot = await hypervisor.createStateRoot(Infinity)
  t.deepEquals(stateRoot, expectedState, 'expected root!')

  t.equals(hypervisor.scheduler.leastNumberOfTicks(), 0)
})

tape('basic - do not store containers with no ports bound', async t => {
  t.plan(1)

  const tree = new RadixTree({
    db: db
  })

  const expectedState = {
    '/': Buffer.from('5a316218edbc909f511b41d936517b27bb51cd6c', 'hex')
  }

  class testVMContainer extends BaseContainer {
    onCreation () {}
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)

  const creationPort = hypervisor.creationService.getPort()
  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: testVMContainer.typeId
    }
  }))

  hypervisor.pin(root)

  root = await hypervisor.getInstance(root.id)

  const [portRef1, portRef2] = root.ports.createChannel()

  await Promise.all([
    root.ports.bind('one', portRef1),
    root.send(creationPort, root.createMessage({
      data: {
        type: testVMContainer.typeId
      },
      ports: [portRef2]
    }))
  ])

  root.shutdown()

  const stateRoot = await hypervisor.createStateRoot(Infinity)

  // await hypervisor.graph.tree(stateRoot, Infinity, true)
  // console.log(JSON.stringify(stateRoot, null, 2))
  t.deepEquals(stateRoot, expectedState, 'expected root!')
})

tape('one child contract', async t => {
  t.plan(4)

  const tree = new RadixTree({
    db: db
  })

  let message
  const expectedState = {
    '/': Buffer.from('c91821c303cd07adde06c0d46c40aafe4542dea1', 'hex')
  }

  let hasResolved = false

  class testVMContainer2 extends BaseContainer {
    onMessage (m) {
      t.true(m === message, 'should recive a message')
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.kernel.incrementTicks(1)
          hasResolved = true
          resolve()
        }, 200)
      })
    }

    static get typeId () {
      return 99
    }
  }

  class testVMContainer extends BaseContainer {
    async onMessage (m) {
      const [portRef1, portRef2] = this.kernel.ports.createChannel()
      const port = this.kernel.hypervisor.creationService.getPort()

      await Promise.all([
        this.kernel.send(port, this.kernel.createMessage({
          data: {
            type: testVMContainer2.typeId
          },
          ports: [portRef2]
        })),
        this.kernel.send(portRef1, m)
      ])

      this.kernel.incrementTicks(1)
      return this.kernel.ports.bind('child', portRef1)
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(testVMContainer)
  hypervisor.registerContainer(testVMContainer2)

  let creationPort = hypervisor.creationService.getPort()
  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: testVMContainer.typeId
    }
  }))

  hypervisor.pin(root)

  const rootId = root.id
  root = await hypervisor.getInstance(rootId)
  const [portRef1, portRef2] = root.ports.createChannel()

  message = root.createMessage()
  await Promise.all([
    root.send(creationPort, root.createMessage({
      data: {
        type: testVMContainer.typeId
      },
      ports: [portRef2]
    })),
    root.ports.bind('first', portRef1),
    root.send(portRef1, message)
  ])

  root.shutdown()

  const stateRoot = await hypervisor.createStateRoot(Infinity)
  t.true(hasResolved, 'should resolve before generating the state root')
  t.deepEquals(stateRoot, expectedState, 'expected state')

  // test reviving the state
  class testVMContainer3 extends BaseContainer {
    onMessage (m) {
      const port = this.kernel.ports.get('child')
      this.kernel.send(port, m)
      this.kernel.incrementTicks(1)
    }
  }

  hypervisor.registerContainer(testVMContainer3)
  root = await hypervisor.getInstance(rootId)
  const port = root.ports.get('first')
  root.send(port, message)
})

tape('traps', async t => {
  t.plan(1)

  const tree = new RadixTree({
    db: db
  })
  class Root extends BaseContainer {
    async onMessage (m) {
      const [portRef1] = this.kernel.ports.createChannel()
      const [portRef3] = this.kernel.ports.createChannel()
      const [portRef5] = this.kernel.ports.createChannel()

      await Promise.all([
        this.kernel.ports.bind('one', portRef1),
        this.kernel.ports.bind('two', portRef3),
        this.kernel.ports.bind('three', portRef5)
      ])

      throw new Error('it is a trap!!!')
    }
  }

  const hypervisor = new Hypervisor(tree)

  hypervisor.registerContainer(Root)
  const creationPort = hypervisor.creationService.getPort()
  const root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  hypervisor.pin(root)

  await root.message(root.createMessage())
  const stateRoot = await hypervisor.createStateRoot()

  t.deepEquals(stateRoot, {
    '/': Buffer.from('308b10121e2c46102e2d9701cfe11032786ef955', 'hex')
  }, 'should revert the state')
})

tape('recieving older messages', async t => {
  t.plan(2)

  const tree = new RadixTree({
    db: db
  })
  let runs = 0
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    async onMessage (m) {
      if (!runs) {
        runs++
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        const [portRef3, portRef4] = this.kernel.ports.createChannel()

        const message1 = this.kernel.createMessage({
          data: {
            type: First.typeId
          },
          ports: [portRef2]
        })
        const message2 = this.kernel.createMessage({
          data: {
            type: Waiter.typeId
          },
          ports: [portRef4]
        })

        return Promise.all([
          this.kernel.send(creationPort, message1),
          this.kernel.send(portRef1, this.kernel.createMessage()),
          this.kernel.send(portRef3, this.kernel.createMessage()),
          this.kernel.ports.bind('one', portRef1),
          this.kernel.ports.bind('two', portRef3),
          this.kernel.send(creationPort, message2)
        ])
      } else if (runs === 1) {
        runs++
        t.equals(m.data, 'first', 'should recive the first message')
      } else {
        runs++
        t.equals(m.data, 'second', 'should recive the second message')
      }
    }
    static get typeId () {
      return 299
    }
  }

  class First extends BaseContainer {
    onMessage (m) {
      this.kernel.incrementTicks(2)
      return this.kernel.send(m.fromPort, this.kernel.createMessage({
        data: 'second'
      }))
    }
    static get typeId () {
      return 29
    }
  }

  class Waiter extends BaseContainer {
    onMessage (m) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.kernel.send(m.fromPort, this.kernel.createMessage({
            data: 'first'
          })).then(resolve)
        }, 200)
      })
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(First)
  hypervisor.registerContainer(Waiter)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  hypervisor.pin(root)

  root = await hypervisor.getInstance(root.id)
  const [portRef1, portRef2] = root.ports.createChannel()

  const message = root.createMessage()
  await Promise.all([
    root.send(portRef1, message),
    root.ports.bind('first', portRef1),
    root.send(creationPort, root.createMessage({
      data: {
        type: Root.typeId
      },
      ports: [portRef2]
    }))
  ])
  root.shutdown()
})

tape('saturation', async t => {
  t.plan(3)

  const tree = new RadixTree({
    db: db
  })
  let runs = 0

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    onIdle () {}
    async onMessage (m) {
      if (!runs) {
        runs++
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        const [portRef3, portRef4] = this.kernel.ports.createChannel()

        const message1 = this.kernel.createMessage({
          data: {
            type: First.typeId
          },
          ports: [portRef2]
        })

        const message2 = this.kernel.createMessage({
          data: {
            type: Second.typeId
          },
          ports: [portRef4]
        })

        this.kernel.incrementTicks(6)
        await Promise.all([
          this.kernel.send(creationPort, message1),
          this.kernel.send(creationPort, message2),
          this.kernel.send(portRef1, this.kernel.createMessage()),
          this.kernel.send(portRef3, this.kernel.createMessage()),
          this.kernel.ports.bind('one', portRef1),
          this.kernel.ports.bind('two', portRef3)
        ])
      } else if (runs === 1) {
        runs++
        t.equals(m.data, 'first', 'should recive the first message')
      } else if (runs === 2) {
        runs++
        t.equals(m.data, 'second', 'should recive the second message')
      } else {
        runs++
        t.equals(m.data, 'third', 'should recived the third message')
      }
    }
    static get typeId () {
      return 299
    }
  }

  class First extends BaseContainer {
    onMessage (m) {
      this.kernel.incrementTicks(2)
      return this.kernel.send(m.fromPort, this.kernel.createMessage({
        data: 'second'
      }))
    }
    static get typeId () {
      return 29
    }
  }

  class Second extends BaseContainer {
    onMessage (m) {
      this.kernel.incrementTicks(3)
      return this.kernel.send(m.fromPort, this.kernel.createMessage({
        data: 'third'
      }))
    }
    static get typeId () {
      return 2
    }
  }

  class Waiter extends BaseContainer {
    onCreation (m) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          this.kernel.send(m.ports[0], this.kernel.createMessage({
            data: 'first'
          })).then(resolve)
        }, 200)
      })
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(First)
  hypervisor.registerContainer(Second)
  hypervisor.registerContainer(Waiter)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  hypervisor.pin(root)
  root = await hypervisor.getInstance(root.id)

  const [portRef1, portRef2] = root.ports.createChannel()
  const [portRef3, portRef4] = root.ports.createChannel()

  const message = root.createMessage()
  await Promise.all([
    root.send(portRef1, message),
    root.ports.bind('first', portRef1),
    root.send(creationPort, root.createMessage({
      data: {
        type: Root.typeId
      },
      ports: [portRef2]
    })),
    root.ports.bind('sencond', portRef3),
    root.send(creationPort, root.createMessage({
      data: {
        type: Waiter.typeId
      },
      ports: [portRef4]
    }))
  ])

  root.incrementTicks(100)
  await root.send(portRef1, root.createMessage({
    data: 'testss'
  }))
  root.shutdown()
})

tape('send to the same container at the same time', async t => {
  t.plan(2)

  const tree = new RadixTree({
    db: db
  })
  let runs = 0
  let instance

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    async onMessage (m) {
      let one = this.kernel.ports.get('one')
      if (!one) {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        const message1 = this.kernel.createMessage({
          data: {
            type: First.typeId
          },
          ports: [portRef2]
        })
        await this.kernel.send(creationPort, message1)
        return this.kernel.ports.bind('one', portRef1)
      } else {
        return Promise.all([
          this.kernel.send(one, this.kernel.createMessage()),
          this.kernel.send(one, this.kernel.createMessage())
        ])
      }
    }
    static get typeId () {
      return 299
    }
  }

  class First extends BaseContainer {
    onMessage (m) {
      ++runs
      if (runs === 2) {
        t.equals(instance, this, 'should have same instances')
      } else {
        instance = this
      }
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(First)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  hypervisor.pin(root)
  root = await hypervisor.getInstance(root.id)

  const [portRef1, portRef2] = root.ports.createChannel()
  await Promise.all([
    root.ports.bind('first', portRef1),
    root.send(creationPort, root.createMessage({
      data: {
        type: Root.typeId
      },
      ports: [portRef2]
    }))
  ])

  const message = root.createMessage()

  await root.send(portRef1, message)
  root.shutdown()
  await hypervisor.createStateRoot()
  await root.send(portRef1, root.createMessage())
  await hypervisor.createStateRoot()
  t.equals(runs, 2)
})

tape('checking ports', async t => {
  t.plan(4)

  const tree = new RadixTree({
    db: db
  })
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()
  hypervisor.registerContainer(BaseContainer)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: BaseContainer.typeId
    }
  }))

  hypervisor.pin(root)
  root = await hypervisor.getInstance(root.id)

  const [portRef1, portRef2] = root.ports.createChannel()
  root.send(creationPort, root.createMessage({
    data: {
      type: BaseContainer.typeId
    },
    ports: [portRef2]
  }))
  await root.ports.bind('test', portRef1)

  try {
    root.createMessage({
      ports: [portRef1]
    })
  } catch (e) {
    t.pass('should thow if sending a port that is bound')
  }

  try {
    await root.ports.bind('test', portRef1)
  } catch (e) {
    t.pass('should thow if binding an already bound port')
  }

  try {
    const [portRef3] = root.ports.createChannel()
    await root.ports.bind('test', portRef3)
  } catch (e) {
    t.pass('should thow if binding an already bound name')
  }

  await root.ports.unbind('test')
  const message = root.createMessage({
    ports: [portRef1]
  })
  t.equals(message.ports[0], portRef1, 'should create a message if the port is unbound')
})

tape('port deletion', async t => {
  const expectedSr = {
    '/': Buffer.from('1f0673f23b4eeb86115992621d7edc981a6afade', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    async onMessage (m) {
      const [portRef1, portRef2] = this.kernel.ports.createChannel()
      const message1 = this.kernel.createMessage({
        data: {
          type: First.typeId
        },
        ports: [portRef2]
      })

      await Promise.all([
        this.kernel.send(creationPort, message1),
        this.kernel.send(portRef1, this.kernel.createMessage())
      ])
      this.kernel.incrementTicks(6)
      return this.kernel.ports.bind('one', portRef1)
    }
  }

  class First extends BaseContainer {
    onMessage (m) {
      this.kernel.incrementTicks(2)
      return this.kernel.ports.delete('root')
    }
    static get typeId () {
      return 299
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(First)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  hypervisor.pin(root)
  root = await hypervisor.getInstance(root.id)

  const [portRef1, portRef2] = root.ports.createChannel()
  await root.ports.bind('first', portRef1)
  await root.send(creationPort, root.createMessage({
    data: {
      type: Root.typeId
    },
    ports: [portRef2]
  }))

  const message = root.createMessage()
  await root.send(portRef1, message)

  root.shutdown()

  const sr = await hypervisor.createStateRoot()
  t.deepEquals(sr, expectedSr, 'should produce the corret state root')

  t.end()
})

tape('clear unbounded ports', async t => {
  const expectedSr = {
    '/': Buffer.from('1f0673f23b4eeb86115992621d7edc981a6afade', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    onMessage (m) {
      return this.kernel.send(creationPort, new Message({
        data: {
          type: Root.typeId
        }
      }))
    }
  }

  hypervisor.registerContainer(Root)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  root = await hypervisor.getInstance(root.id)
  hypervisor.pin(root)

  const [portRef1, portRef2] = root.ports.createChannel()
  await root.ports.bind('first', portRef1)
  await root.send(creationPort, root.createMessage({
    data: {
      type: Root.typeId
    },
    ports: [portRef2]
  }))

  const message = root.createMessage()
  await root.send(portRef1, message)
  root.shutdown()
  const sr = await hypervisor.createStateRoot()
  t.deepEquals(sr, expectedSr, 'should produce the corret state root')

  t.end()
})

tape('should remove subgraphs', async t => {
  const expectedSr = {
    '/': Buffer.from('1f0673f23b4eeb86115992621d7edc981a6afade', 'hex')
  }

  const tree = new RadixTree({
    db: db
  })
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    onMessage (m) {
      const [, portRef2] = this.kernel.ports.createChannel()
      return this.kernel.send(creationPort, this.kernel.createMessage({
        data: {
          type: Sub.typeId
        },
        ports: [portRef2]
      }))
    }
  }

  class Sub extends BaseContainer {
    static get typeId () {
      return 299
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(Sub)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  root = await hypervisor.getInstance(root.id)

  hypervisor.pin(root)

  const [portRef1, portRef2] = root.ports.createChannel()
  await root.ports.bind('first', portRef1)
  await root.send(creationPort, root.createMessage({
    data: {
      type: Root.typeId
    },
    ports: [portRef2]
  }))

  await root.send(portRef1, root.createMessage())
  root.shutdown()
  const sr = await hypervisor.createStateRoot()

  t.deepEquals(sr, expectedSr, 'should produce the corret state root')
  t.end()
})

tape('should not remove connected nodes', async t => {
  const tree = new RadixTree({
    db: db
  })
  const expectedSr = {
    '/': Buffer.from('76711d128d0be5fe86833af5ab8f48afeec3410e', 'hex')
  }

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    async onMessage (m) {
      if (m.ports.length) {
        const port = this.kernel.ports.get('test1')
        await this.kernel.send(port, m)
        return this.kernel.ports.unbind('test1')
      } else {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        await this.kernel.send(creationPort, this.kernel.createMessage({
          data: {
            type: Sub.typeId
          },
          ports: [portRef2]
        }))
        await this.kernel.ports.bind('test1', portRef1)

        const [portRef3, portRef4] = this.kernel.ports.createChannel()
        await this.kernel.send(creationPort, this.kernel.createMessage({
          data: {
            type: Sub.typeId
          },
          ports: [portRef4]
        }))
        await this.kernel.ports.bind('test2', portRef3)
        await this.kernel.send(portRef3, this.kernel.createMessage({
          data: 'getChannel'
        }))
      }
    }
  }

  class Sub extends BaseContainer {
    async onMessage (message) {
      if (message.data === 'getChannel') {
        const ports = this.kernel.ports.createChannel()
        await this.kernel.send(message.fromPort, this.kernel.createMessage({
          data: 'bindPort',
          ports: [ports[1]]
        }))
        return this.kernel.ports.bind('channel', ports[0])
      } else {
        return this.kernel.ports.bind('channel', message.ports[0])
      }
    }
    static get typeId () {
      return 299
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(Sub)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  root = await hypervisor.getInstance(root.id)
  hypervisor.pin(root)

  const [portRef1, portRef2] = root.ports.createChannel()
  await root.ports.bind('first', portRef1)
  await root.send(creationPort, root.createMessage({
    data: {
      type: Root.typeId
    },
    ports: [portRef2]
  }))

  await root.send(portRef1, root.createMessage())
  root.shutdown()
  const sr = await hypervisor.createStateRoot()

  t.deepEquals(sr, expectedSr, 'should produce the corret state root')
  t.end()
})

tape('should remove multiple subgraphs', async t => {
  const tree = new RadixTree({
    db: db
  })
  const expectedSr = {
    '/': Buffer.from('196a7b55f26afb41f065923332e14b40cd0edf2e', 'hex')
  }

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class Root extends BaseContainer {
    onMessage (m) {
      if (m.ports.length) {
        const port = this.kernel.ports.get('test1')
        return Promise.all([
          this.kernel.send(port, m),
          this.kernel.ports.unbind('test1'),
          this.kernel.ports.unbind('test2')
        ])
      } else {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        const [portRef3, portRef4] = this.kernel.ports.createChannel()
        return Promise.all([
          this.kernel.send(creationPort, this.kernel.createMessage({
            data: {
              type: Sub.typeId
            },
            ports: [portRef2]
          })),
          this.kernel.ports.bind('test1', portRef1),
          this.kernel.send(creationPort, this.kernel.createMessage({
            data: {
              type: Sub.typeId
            },
            ports: [portRef4]
          })),
          this.kernel.ports.bind('test2', portRef3),
          this.kernel.send(portRef3, this.kernel.createMessage({
            data: 'getChannel'
          }))
        ])
      }
    }
  }

  class Sub extends BaseContainer {
    async onMessage (message) {
      if (message.data === 'getChannel') {
        const ports = this.kernel.ports.createChannel()
        await this.kernel.send(message.fromPort, this.kernel.createMessage({
          data: 'bindPort',
          ports: [ports[1]]
        }))
        return this.kernel.ports.bind('channel', ports[0])
      } else {
        return this.kernel.ports.bind('channel', message.ports[0])
      }
    }
    static get typeId () {
      return 299
    }
  }

  hypervisor.registerContainer(Root)
  hypervisor.registerContainer(Sub)

  let root = await hypervisor.send(creationPort, new Message({
    data: {
      type: Root.typeId
    }
  }))

  root = await hypervisor.getInstance(root.id)
  hypervisor.pin(root)

  const [portRef1, portRef2] = root.ports.createChannel()
  await Promise.all([
    root.ports.bind('first', portRef1),
    root.send(creationPort, root.createMessage({
      data: {
        type: Root.typeId
      },
      ports: [portRef2]
    })),
    root.send(portRef1, root.createMessage())
  ])

  root.shutdown()

  const sr = await hypervisor.createStateRoot()

  t.deepEquals(sr, expectedSr, 'should produce the corret state root')

  t.end()
})

tape('response ports', async t => {
  t.plan(2)
  const tree = new RadixTree({
    db: db
  })
  let runs = 0
  const returnValue = 'this is a test'
  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()

  class testVMContainer extends BaseContainer {
    onMessage (m) {
      runs++
      if (runs === 1) {
        return returnValue
      } else {
        t.equals(m.data, returnValue, 'should have correct return value')
      }
    }
  }

  hypervisor.registerContainer(testVMContainer)

  let rootContainer = await hypervisor.send(creationPort, new Message({
    data: {
      type: testVMContainer.typeId
    }
  }))

  rootContainer = await hypervisor.getInstance(rootContainer.id)

  hypervisor.pin(rootContainer)

  const [portRef1, portRef2] = rootContainer.ports.createChannel()
  const initMessage = rootContainer.createMessage({
    data: {
      type: testVMContainer.typeId
    },
    ports: [portRef2]
  })

  rootContainer.send(creationPort, initMessage)

  await rootContainer.ports.bind('first', portRef1)
  const message = rootContainer.createMessage()
  const rPort = rootContainer.getResponsePort(message)
  const rPort2 = rootContainer.getResponsePort(message)

  t.equals(rPort2, rPort)

  rootContainer.send(portRef1, message)
  await rootContainer.ports.bind('response', rPort)
})

tape('start up', async t => {
  t.plan(1)

  const tree = new RadixTree({
    db: db
  })

  class testVMContainer extends BaseContainer {
    onStartup () {
      t.pass('should start up')
    }
  }

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()
  hypervisor.registerContainer(testVMContainer)
  const instance = await hypervisor.send(creationPort, new Message({
    data: {
      type: testVMContainer.typeId
    }
  }))
  hypervisor.getInstance(instance.id)
})

tape('large code size', async t => {
  t.plan(1)
  const tree = new RadixTree({
    db: db
  })
  const content = Buffer.from(new ArrayBuffer(1e6))
  class testVMContainer extends BaseContainer {}

  const hypervisor = new Hypervisor(tree)
  const creationPort = hypervisor.creationService.getPort()
  hypervisor.registerContainer(testVMContainer)
  const oldInst = await hypervisor.send(creationPort, new Message({
    data: {
      type: testVMContainer.typeId,
      code: content
    }
  }))
  const instance = await hypervisor.getInstance(oldInst.id)
  t.equals(content.length, instance.code.length)
})

tape('creation service messaging', async t => {
  t.plan(1)

  const tree = new RadixTree({
    db: db
  })

  class TestVMContainer extends BaseContainer {
    async onCreation (m) {
      const creationPort = m.ports[0]
      const [port1, port2] = this.kernel.ports.createChannel()
      await this.kernel.ports.bind('child', port1)

      const message = this.kernel.createMessage({
        data: {
          type: TestVMContainer2.typeId
        },
        ports: [port2]
      })
      return this.kernel.send(creationPort, message)
    }
  }

  class TestVMContainer2 extends BaseContainer {
    static get typeId () {
      return 66
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestVMContainer)
  hypervisor.registerContainer(TestVMContainer2)

  const port = hypervisor.creationService.getPort()
  const port2 = hypervisor.creationService.getPort()

  const root = await hypervisor.send(port2, new Message({
    data: {
      type: TestVMContainer.typeId
    },
    ports: [port]
  }))

  hypervisor.pin(root)

  const stateRoot = await hypervisor.createStateRoot()
    // await hypervisor.graph.tree(hypervisor.state, Infinity, true)
  const expectedSR = {
    '/': Buffer.from('c86f6a4519b4a18e1f31abe357a84712aabce8d2', 'hex')
  }
  t.deepEquals(stateRoot, expectedSR)
})

tape('creation service - port copy', async t => {
  t.plan(2)

  const tree = new RadixTree({
    db: db
  })

  class TestVMContainer extends BaseContainer {
    onCreation (m) {
      const creationPort = m.ports[0]

      const message = this.kernel.createMessage()
      const responePort = this.kernel.getResponsePort(message)

      return Promise.all([
        this.kernel.ports.bind('response', responePort),
        this.kernel.send(creationPort, message)
      ])
    }
    onMessage (m) {
      t.equal(m.fromName, 'response')
      t.equal(m.ports.length, 1)
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestVMContainer)

  const port = hypervisor.creationService.getPort()

  const root = await hypervisor.send(port, new Message({
    data: {
      type: TestVMContainer.typeId
    },
    ports: [port]
  }))

  hypervisor.pin(root)
})

tape('waiting on ports', async t => {
  t.plan(1)

  const tree = new RadixTree({
    db: db
  })

  class TestVMContainer extends BaseContainer {
    async onCreation (m) {
      await this.kernel.ports.bind('test', m.ports[0])
      this.kernel.ports.getNextMessage()
      try {
        await this.kernel.ports.getNextMessage()
      } catch (e) {
        t.pass('should throw if already trying to get a message')
      }
    }
  }

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(TestVMContainer)

  const port = hypervisor.creationService.getPort()

  await hypervisor.send(port, new Message({
    data: {
      type: TestVMContainer.typeId
    },
    ports: [port]
  }))
})
