const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')

// start ipfs
const node = new IPFS({
  start: false
})

class BaseContainer {
  constructor (exInterface) {
    this.exInterface = exInterface
  }

  initialize (message) {
    const port = message.ports[0]
    if (port) {
      this.exInterface.ports.bind('root', port)
    }
  }
}

node.on('ready', () => {
  tape('basic', async t => {
    t.plan(2)
    let message
    const expectedState = {
      '/': 'zdpuB1wc9Pb6jUzfNt4nAxAEUxB7kNhg4vbq7YLcEyBUb6iAB'
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)

    const rootContainer = await hypervisor.createInstance('test')

    const [portRef1, portRef2] = rootContainer.ports.createChannel()
    const initMessage = rootContainer.createMessage({
      data: Buffer.from('test code'),
      ports: [portRef2]
    })

    rootContainer.ports.create('test', initMessage)

    rootContainer.ports.bind('first', portRef1)
    message = rootContainer.createMessage()
    rootContainer.send(portRef1, message)

    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
  })

  tape('basic - do not store containers with no ports bound', async t => {
    t.plan(1)
    const expectedState = {
      '/': 'zdpuAx5LRRwTgzPipKEPgh7MHUKu4Pd1BYjDqBcf9whgzvrqf'
    }

    class testVMContainer extends BaseContainer {
      initialize () {}
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)

    const root = await hypervisor.createInstance('test')
    const [portRef1, portRef2] = root.ports.createChannel()

    root.ports.bind('one', portRef1)
    root.ports.create('test', root.createMessage({
      ports: [portRef2]
    }))

    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
  })

  tape('one child contract with saturated ports', async t => {
    t.plan(2)
    let message
    const expectedState = {
      '/': 'zdpuAtVcH6MUnvt2RXnLsDXyLB3CBSQ7aydfh2ogSKGCejJCQ'
    }

    class testVMContainer2 extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        const [portRef1, portRef2] = this.exInterface.ports.createChannel()
        this.exInterface.ports.create('test2', this.exInterface.createMessage({
          ports: [portRef2]
        }))
        this.exInterface.ports.bind('child', portRef1)
        this.exInterface.incrementTicks(2)
        this.exInterface.send(portRef1, m)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    const root = await hypervisor.createInstance('test')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('test', root.createMessage({
      ports: [portRef2]
    }))

    root.ports.bind('first', portRef1)
    message = root.createMessage({
      data: 'test'
    })

    root.send(portRef1, message)
    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected state')
  })

  tape('one child contract', async t => {
    t.plan(4)
    let message
    const expectedState = {
      '/': 'zdpuAtVcH6MUnvt2RXnLsDXyLB3CBSQ7aydfh2ogSKGCejJCQ'
    }
    let hasResolved = false

    class testVMContainer2 extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this.exInterface.incrementTicks(1)
            hasResolved = true
            resolve()
          }, 200)
        })
      }
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        const [portRef1, portRef2] = this.exInterface.ports.createChannel()
        this.exInterface.ports.create('test2', this.exInterface.createMessage({
          ports: [portRef2]
        }))
        this.exInterface.ports.bind('child', portRef1)
        this.exInterface.send(portRef1, m)
        this.exInterface.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    const rootId = root.id
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('test', root.createMessage({
      ports: [portRef2]
    }))

    root.ports.bind('first', portRef1)
    message = root.createMessage()

    root.send(portRef1, message)
    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.true(hasResolved, 'should resolve before generating the state root')
    t.deepEquals(stateRoot, expectedState, 'expected state')

    // test reviving the state
    class testVMContainer3 extends BaseContainer {
      run (m) {
        const port = this.exInterface.ports.get('child')
        this.exInterface.send(port, m)
        this.exInterface.incrementTicks(1)
      }
    }

    hypervisor.registerContainer('test', testVMContainer3)
    root = await hypervisor.getInstance(rootId)
    const port = root.ports.get('first')
    root.send(port, message)
  })

  tape('traps', async t => {
    t.plan(1)
    class Root extends BaseContainer {
      async run (m) {
        const [portRef1, portRef2] = this.exInterface.ports.createChannel()
        const [portRef3, portRef4] = this.exInterface.ports.createChannel()
        const [portRef5, portRef6] = this.exInterface.ports.createChannel()

        this.exInterface.ports.bind('one', portRef1)
        this.exInterface.ports.bind('two', portRef3)
        this.exInterface.ports.bind('three', portRef5)

        const message1 = this.exInterface.createMessage({
          ports: [portRef2]
        })
        const message2 = this.exInterface.createMessage({
          ports: [portRef4]
        })
        const message3 = this.exInterface.createMessage({
          ports: [portRef6]
        })

        this.exInterface.ports.create('root', message1)
        this.exInterface.ports.create('root', message2)
        this.exInterface.ports.create('root', message3)

        throw new Error('it is a trap!!!')
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    const root = await hypervisor.createInstance('root')
    await root.run(root.createMessage())
    const stateRoot = await hypervisor.createStateRoot()

    t.deepEquals(stateRoot, {
      '/': 'zdpuAwrMmQXqFusve7zcRYxVUuji4NVzZR5GyjwyStsjteCoW'
    }, 'should revert the state')
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++

          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('two', portRef3)
          this.exInterface.ports.bind('one', portRef1)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(3)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')

    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.ports.bind('first', portRef1)
    const message = root.createMessage()
    root.send(portRef1, message)
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++

          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('one', portRef1)
          this.exInterface.ports.bind('two', portRef3)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        } else if (runs === 2) {
          t.equals(m.data, 'first', 'should recive the first message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(1)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')

    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.ports.bind('first', portRef1)
    const message = root.createMessage()
    root.send(portRef1, message)
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('one', portRef1)
          this.exInterface.ports.bind('two', portRef3)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())

          this.exInterface.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(1)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.ports.bind('first', portRef1)
    const message = root.createMessage()
    root.send(portRef1, message)
  })

  tape('saturation', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('one', portRef1)
          this.exInterface.ports.bind('two', portRef3)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())

          this.exInterface.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(3)
        console.log('sending second', this.exInterface.ticks)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    class Waiter extends BaseContainer {
      initialize () {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 200)
        })
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)
    hypervisor.registerContainer('waiter', Waiter)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()

    const message = root.createMessage()
    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    const [portRef3, portRef4] = root.ports.createChannel()
    root.ports.bind('sencond', portRef3)
    root.ports.create('waiter', root.createMessage({
      ports: [portRef4]
    }))

    root.incrementTicks(100)
    root.send(portRef1, root.createMessage({data: 'testss'}))
    hypervisor.scheduler.done(root.id)
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('two', portRef3)
          this.exInterface.ports.bind('one', portRef1)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())

          this.exInterface.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        } else if (runs === 2) {
          t.equals(m.data, 'first', 'should recive the first message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    const message = root.createMessage()

    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          const [portRef3, portRef4] = this.exInterface.ports.createChannel()

          this.exInterface.ports.bind('one', portRef1)
          this.exInterface.ports.bind('two', portRef3)

          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          const message2 = this.exInterface.createMessage({
            ports: [portRef4]
          })

          this.exInterface.ports.create('first', message1)
          this.exInterface.ports.create('second', message2)

          this.exInterface.send(portRef1, this.exInterface.createMessage())
          this.exInterface.send(portRef3, this.exInterface.createMessage())

          this.exInterface.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        return this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    const message = root.createMessage()

    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))
  })

  tape('send to the same container at the same time', async t => {
    t.plan(2)

    let runs = 0
    let instance

    class Root extends BaseContainer {
      run (m) {
        let one = this.exInterface.ports.get('one')
        if (!one) {
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          this.exInterface.ports.bind('one', portRef1)
          const message1 = this.exInterface.createMessage({
            ports: [portRef2]
          })
          this.exInterface.ports.create('first', message1)
        } else {
          this.exInterface.send(one, this.exInterface.createMessage())
          this.exInterface.send(one, this.exInterface.createMessage())
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        ++runs
        if (runs === 2) {
          t.equals(instance, this, 'should have same instances')
        } else {
          instance = this
        }
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    const message = root.createMessage()
    root.send(portRef1, message)
    await hypervisor.createStateRoot()
    root.send(portRef1, root.createMessage())
    await hypervisor.createStateRoot()
    t.equals(runs, 2)
  })

  tape('checking ports', async t => {
    t.plan(4)
    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('base', BaseContainer)

    const root = await hypervisor.createInstance('base')

    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.create('base', root.createMessage({
      ports: [portRef2]
    }))
    root.ports.bind('test', portRef1)

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
      '/': 'zdpuB2QXxn1KQtLFfBqaritTRoe5BuKP5sNFSrPtRT6sxkY7Z'
    }
    class Root extends BaseContainer {
      run (m) {
        const [portRef1, portRef2] = this.exInterface.ports.createChannel()
        this.exInterface.ports.bind('one', portRef1)
        const message1 = this.exInterface.createMessage({
          ports: [portRef2]
        })

        this.exInterface.ports.create('first', message1)
        this.exInterface.send(portRef1, this.exInterface.createMessage())
        this.exInterface.incrementTicks(6)
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        this.exInterface.ports.delete('root')
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    const message = root.createMessage()
    root.send(portRef1, message)

    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')

    t.end()
  })

  tape('clear unbounded ports', async t => {
    const expectedSr = {
      '/': 'zdpuB2QXxn1KQtLFfBqaritTRoe5BuKP5sNFSrPtRT6sxkY7Z'
    }
    class Root extends BaseContainer {
      run (m) {
        this.exInterface.ports.create('root')
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    const message = root.createMessage()
    root.send(portRef1, message)
    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')

    t.end()
  })

  tape('should remove subgraphs', async t => {
    const expectedSr = {
      '/': 'zdpuB2QXxn1KQtLFfBqaritTRoe5BuKP5sNFSrPtRT6sxkY7Z'
    }
    class Root extends BaseContainer {
      run (m) {
        const [, portRef2] = this.exInterface.ports.createChannel()
        this.exInterface.ports.create('sub', this.exInterface.createMessage({
          ports: [portRef2]
        }))
      }
    }

    class Sub extends BaseContainer {
      initailize (message) {
        this.exInterface.ports.bind('root', message.ports[0])
        const [portRef1, portRef2] = root.ports.createChannel()
        root.ports.bind('child', portRef1)
        root.ports.create('root', root.createMessage({
          ports: [portRef2]
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('sub', Sub)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.send(portRef1, root.createMessage())
    const sr = await hypervisor.createStateRoot()

    t.deepEquals(sr, expectedSr, 'should produce the corret state root')
    t.end()
  })

  tape('should not remove connected nodes', async t => {
    const expectedSr = {
      '/': 'zdpuAwsZTd5mRZBCYA1FJSHrpYDPgSZSiaTQp9xkUeajaoMHM'
    }
    class Root extends BaseContainer {
      run (m) {
        if (m.ports.length) {
          const port = this.exInterface.ports.get('test1')
          this.exInterface.send(port, m)
          this.exInterface.ports.unbind('test1')
        } else {
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          this.exInterface.ports.create('sub', this.exInterface.createMessage({
            ports: [portRef2]
          }))
          this.exInterface.ports.bind('test1', portRef1)

          const [portRef3, portRef4] = this.exInterface.ports.createChannel()
          this.exInterface.ports.create('sub', this.exInterface.createMessage({
            ports: [portRef4]
          }))
          this.exInterface.ports.bind('test2', portRef3)
          this.exInterface.send(portRef3, this.exInterface.createMessage({
            data: 'getChannel'
          }))
        }
      }
    }

    class Sub extends BaseContainer {
      run (message) {
        if (message.data === 'getChannel') {
          const ports = this.exInterface.ports.createChannel()
          this.exInterface.ports.bind('channel', ports[0])
          this.exInterface.send(message.fromPort, this.exInterface.createMessage({
            data: 'bindPort',
            ports: [ports[1]]
          }))
        } else if (message.data === 'bindPort') {
          this.exInterface.ports.bind('channel', message.ports[0])
        }
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('sub', Sub)

    const root = await hypervisor.createInstance('root')
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.send(portRef1, root.createMessage())
    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')
      // await hypervisor.graph.tree(sr, Infinity)

    t.end()
  })

  tape('should remove multiple subgraphs', async t => {
    const expectedSr = {
      '/': 'zdpuAmi9tkYTpoVsZvqQgxpQFRhCgYFVv4W3fjjfVhf1j8swv'
    }
    class Root extends BaseContainer {
      run (m) {
        if (m.ports.length) {
          const port = this.exInterface.ports.get('test1')
          this.exInterface.send(port, m)
          this.exInterface.ports.unbind('test1')
          this.exInterface.ports.unbind('test2')
        } else {
          const [portRef1, portRef2] = this.exInterface.ports.createChannel()
          this.exInterface.ports.create('sub', this.exInterface.createMessage({
            ports: [portRef2]
          }))
          this.exInterface.ports.bind('test1', portRef1)

          const [portRef3, portRef4] = this.exInterface.ports.createChannel()
          this.exInterface.ports.create('sub', this.exInterface.createMessage({
            ports: [portRef4]
          }))
          this.exInterface.ports.bind('test2', portRef3)
          this.exInterface.send(portRef3, this.exInterface.createMessage({
            data: 'getChannel'
          }))
        }
      }
    }

    class Sub extends BaseContainer {
      run (message) {
        if (message.data === 'getChannel') {
          const ports = this.exInterface.ports.createChannel()
          this.exInterface.ports.bind('channel', ports[0])
          this.exInterface.send(message.fromPort, this.exInterface.createMessage({
            data: 'bindPort',
            ports: [ports[1]]
          }))
        } else if (message.data === 'bindPort') {
          this.exInterface.ports.bind('channel', message.ports[0])
        }
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('sub', Sub)

    const root = await hypervisor.createInstance('root')

    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.ports.create('root', root.createMessage({
      ports: [portRef2]
    }))

    root.send(portRef1, root.createMessage())

    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')

    t.end()
  })
})
