const tape = require('tape')
const IPFS = require('ipfs')
const AbstractContainer = require('primea-abstract-container')
const Message = require('primea-message')
const Hypervisor = require('../')

// start ipfs
const node = new IPFS({
  start: false
})

class BaseContainer extends AbstractContainer {
  onCreation (message) {
    this.kernel.state.code = message.data.byteLength ? message.data : undefined
    const port = message.ports[0]
    if (port) {
      this.kernel.ports.bind('root', port)
    }
  }
  static get typeId () {
    return 9
  }
}

node.on('ready', () => {
  tape('basic', async t => {
    t.plan(3)
    let message
    const expectedState = {
      '/': 'zdpuAmN9VSrvNbArWkAEhEYaKhhCT3rk8xMhUam6eUfQmr6aZ'
    }

    class testVMContainer extends BaseContainer {
      onMessage (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)

    const rootContainer = await hypervisor.createInstance(testVMContainer.typeId)

    const [portRef1, portRef2] = rootContainer.ports.createChannel()
    const initMessage = rootContainer.createMessage({
      data: Buffer.from('test code'),
      ports: [portRef2]
    })

    rootContainer.createInstance(testVMContainer.typeId, initMessage)

    rootContainer.ports.bind('first', portRef1)
    message = rootContainer.createMessage()
    rootContainer.send(portRef1, message)

    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
    t.equals(hypervisor.scheduler.oldest(), 0)
  })

  tape('basic - do not store containers with no ports bound', async t => {
    t.plan(1)
    const expectedState = {
      '/': 'zdpuAxGvPHM4DRbq7GeyGjwuPA8NT7DZLszcDDX9R5iwHWnTo'
    }

    class testVMContainer extends BaseContainer {
      onCreation () {}
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)

    const root = await hypervisor.createInstance(testVMContainer.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()

    root.ports.bind('one', portRef1)
    root.createInstance(testVMContainer.typeId, root.createMessage({
      ports: [portRef2]
    }))

    const stateRoot = await hypervisor.createStateRoot(Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
  })

  tape('one child contract with saturated ports', async t => {
    t.plan(2)
    let message
    const expectedState = {
      '/': 'zdpuAvWT2E1Hg6cvFNLTDbmjGRLSDbMnRtrA6s17oSdBX5EWs'
    }

    class testVMContainer2 extends BaseContainer {
      onMessage (m) {
        t.true(m === message, 'should recive a message')
      }
      static get typeId () {
        return 99
      }
    }

    class testVMContainer extends BaseContainer {
      onMessage (m) {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        this.kernel.createInstance(testVMContainer2.typeId, this.kernel.createMessage({
          ports: [portRef2]
        }))
        this.kernel.ports.bind('child', portRef1)
        this.kernel.incrementTicks(2)
        this.kernel.send(portRef1, m)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)
    hypervisor.registerContainer(testVMContainer2)

    const root = await hypervisor.createInstance(testVMContainer.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(testVMContainer.typeId, root.createMessage({
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
      '/': 'zdpuAvWT2E1Hg6cvFNLTDbmjGRLSDbMnRtrA6s17oSdBX5EWs'
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
      onMessage (m) {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        this.kernel.createInstance(testVMContainer2.typeId, this.kernel.createMessage({
          ports: [portRef2]
        }))
        this.kernel.ports.bind('child', portRef1)
        this.kernel.send(portRef1, m)
        this.kernel.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)
    hypervisor.registerContainer(testVMContainer2)

    let root = await hypervisor.createInstance(testVMContainer.typeId)
    const rootId = root.id
    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(testVMContainer.typeId, root.createMessage({
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
    class Root extends BaseContainer {
      async onMessage (m) {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        const [portRef3, portRef4] = this.kernel.ports.createChannel()
        const [portRef5, portRef6] = this.kernel.ports.createChannel()

        this.kernel.ports.bind('one', portRef1)
        this.kernel.ports.bind('two', portRef3)
        this.kernel.ports.bind('three', portRef5)

        const message1 = this.kernel.createMessage({
          ports: [portRef2]
        })
        const message2 = this.kernel.createMessage({
          ports: [portRef4]
        })
        const message3 = this.kernel.createMessage({
          ports: [portRef6]
        })

        this.kernel.createInstance(Root.typeId, message1)
        this.kernel.createInstance(Root.typeId, message2)
        this.kernel.createInstance(Root.typeId, message3)

        throw new Error('it is a trap!!!')
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    const root = await hypervisor.createInstance(Root.typeId)
    await root.message(root.createMessage())
    const stateRoot = await hypervisor.createStateRoot()

    t.deepEquals(stateRoot, {
      '/': 'zdpuAwxK8kAM3SkxSyALurpFHTobp6sFJef9gZJ8ZDQRww1LN'
    }, 'should revert the state')
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      onMessage (m) {
        if (!runs) {
          runs++

          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('two', portRef3)
          this.kernel.ports.bind('one', portRef1)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }

      static get typeId () {
        return 99
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(3)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }

      static get typeId () {
        return 299
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)

    const root = await hypervisor.createInstance(Root.typeId)

    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(Root.typeId, root.createMessage({
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
      onMessage (m) {
        if (!runs) {
          runs++

          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('one', portRef1)
          this.kernel.ports.bind('two', portRef3)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        } else if (runs === 2) {
          t.equals(m.data, 'first', 'should recive the first message')
        }
      }

      static get typeId () {
        return 99
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }

      static get typeId () {
        return 299
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(1)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)

    const root = await hypervisor.createInstance(Root.typeId)

    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(Root.typeId, root.createMessage({
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
      onMessage (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('one', portRef1)
          this.kernel.ports.bind('two', portRef3)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())

          this.kernel.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
      static get typeId () {
        return 299
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(1)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
      static get typeId () {
        return 2
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(Root.typeId, root.createMessage({
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
      onMessage (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('one', portRef1)
          this.kernel.ports.bind('two', portRef3)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())

          this.kernel.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
      static get typeId () {
        return 299
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
      static get typeId () {
        return 29
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(3)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
      static get typeId () {
        return 2
      }
    }

    class Waiter extends BaseContainer {
      onCreation () {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 200)
        })
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)
    hypervisor.registerContainer(Waiter)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()

    const message = root.createMessage()
    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
      ports: [portRef2]
    }))

    const [portRef3, portRef4] = root.ports.createChannel()
    root.ports.bind('sencond', portRef3)
    root.createInstance(Waiter.typeId, root.createMessage({
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
      onMessage (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('two', portRef3)
          this.kernel.ports.bind('one', portRef1)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())

          this.kernel.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'second', 'should recived the second message')
        } else if (runs === 2) {
          t.equals(m.data, 'first', 'should recive the first message')
        }
      }
      static get typeId () {
        return 299
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
      static get typeId () {
        return 29
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
      static get typeId () {
        return 2
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    const message = root.createMessage()

    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
      ports: [portRef2]
    }))
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    let runs = 0

    class Root extends BaseContainer {
      onMessage (m) {
        if (!runs) {
          runs++
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          const [portRef3, portRef4] = this.kernel.ports.createChannel()

          this.kernel.ports.bind('one', portRef1)
          this.kernel.ports.bind('two', portRef3)

          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          const message2 = this.kernel.createMessage({
            ports: [portRef4]
          })

          this.kernel.createInstance(First.typeId, message1)
          this.kernel.createInstance(Second.typeId, message2)

          this.kernel.send(portRef1, this.kernel.createMessage())
          this.kernel.send(portRef3, this.kernel.createMessage())

          this.kernel.incrementTicks(6)
        } else if (runs === 1) {
          runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
      static get typeId () {
        return 299
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
      static get typeId () {
        return 29
      }
    }

    class Second extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)
    hypervisor.registerContainer(Second)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    const message = root.createMessage()

    root.send(portRef1, message)
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
      ports: [portRef2]
    }))
  })

  tape('send to the same container at the same time', async t => {
    t.plan(2)

    let runs = 0
    let instance

    class Root extends BaseContainer {
      onMessage (m) {
        let one = this.kernel.ports.get('one')
        if (!one) {
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          this.kernel.ports.bind('one', portRef1)
          const message1 = this.kernel.createMessage({
            ports: [portRef2]
          })
          this.kernel.createInstance(First.typeId, message1)
        } else {
          this.kernel.send(one, this.kernel.createMessage())
          this.kernel.send(one, this.kernel.createMessage())
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

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
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
    hypervisor.registerContainer(BaseContainer)

    const root = await hypervisor.createInstance(BaseContainer.typeId)

    const [portRef1, portRef2] = root.ports.createChannel()
    root.createInstance(BaseContainer.typeId, root.createMessage({
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
      '/': 'zdpuAqFMWKsATaU1gJwMTegcw18GFQ7szZix3QNgMN2sYm2vh'
    }
    class Root extends BaseContainer {
      onMessage (m) {
        const [portRef1, portRef2] = this.kernel.ports.createChannel()
        this.kernel.ports.bind('one', portRef1)
        const message1 = this.kernel.createMessage({
          ports: [portRef2]
        })

        this.kernel.createInstance(First.typeId, message1)
        this.kernel.send(portRef1, this.kernel.createMessage())
        this.kernel.incrementTicks(6)
      }
    }

    class First extends BaseContainer {
      onMessage (m) {
        this.kernel.incrementTicks(2)
        this.kernel.ports.delete('root')
      }
      static get typeId () {
        return 299
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(First)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
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
      '/': 'zdpuAqFMWKsATaU1gJwMTegcw18GFQ7szZix3QNgMN2sYm2vh'
    }
    class Root extends BaseContainer {
      onMessage (m) {
        this.kernel.createInstance(Root.typeId)
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
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
      '/': 'zdpuAqFMWKsATaU1gJwMTegcw18GFQ7szZix3QNgMN2sYm2vh'
    }
    class Root extends BaseContainer {
      onMessage (m) {
        const [, portRef2] = this.kernel.ports.createChannel()
        this.kernel.createInstance(Sub.typeId, this.kernel.createMessage({
          ports: [portRef2]
        }))
      }
    }

    class Sub extends BaseContainer {
      onInitailize (message) {
        this.kernel.ports.bind('root', message.ports[0])
        const [portRef1, portRef2] = root.ports.createChannel()
        root.ports.bind('child', portRef1)
        root.createInstance(Root.typeId, root.createMessage({
          ports: [portRef2]
        }))
      }
      static get typeId () {
        return 299
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(Sub)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
      ports: [portRef2]
    }))

    root.send(portRef1, root.createMessage())
    const sr = await hypervisor.createStateRoot()

    t.deepEquals(sr, expectedSr, 'should produce the corret state root')
    t.end()
  })

  tape('should not remove connected nodes', async t => {
    const expectedSr = {
      '/': 'zdpuAppPTaXwHnfU2yjtTyT9XsY7SJAkDwQWUZnkHU7myRzaj'
    }
    class Root extends BaseContainer {
      onMessage (m) {
        if (m.ports.length) {
          const port = this.kernel.ports.get('test1')
          this.kernel.send(port, m)
          this.kernel.ports.unbind('test1')
        } else {
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          this.kernel.createInstance(Sub.typeId, this.kernel.createMessage({
            ports: [portRef2]
          }))
          this.kernel.ports.bind('test1', portRef1)

          const [portRef3, portRef4] = this.kernel.ports.createChannel()
          this.kernel.createInstance(Sub.typeId, this.kernel.createMessage({
            ports: [portRef4]
          }))
          this.kernel.ports.bind('test2', portRef3)
          this.kernel.send(portRef3, this.kernel.createMessage({
            data: 'getChannel'
          }))
        }
      }
    }

    class Sub extends BaseContainer {
      onMessage (message) {
        if (message.data === 'getChannel') {
          const ports = this.kernel.ports.createChannel()
          this.kernel.ports.bind('channel', ports[0])
          this.kernel.send(message.fromPort, this.kernel.createMessage({
            data: 'bindPort',
            ports: [ports[1]]
          }))
        } else if (message.data === 'bindPort') {
          this.kernel.ports.bind('channel', message.ports[0])
        }
      }
      static get typeId () {
        return 299
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(Sub)

    const root = await hypervisor.createInstance(Root.typeId)
    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
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
      '/': 'zdpuAvQqoEnojZHaw6dMDy8ACRVqfarfD2RCKTwFBYsj8suRC'
    }
    class Root extends BaseContainer {
      onMessage (m) {
        if (m.ports.length) {
          const port = this.kernel.ports.get('test1')
          this.kernel.send(port, m)
          this.kernel.ports.unbind('test1')
          this.kernel.ports.unbind('test2')
        } else {
          const [portRef1, portRef2] = this.kernel.ports.createChannel()
          this.kernel.createInstance(Sub.typeId, this.kernel.createMessage({
            ports: [portRef2]
          }))
          this.kernel.ports.bind('test1', portRef1)

          const [portRef3, portRef4] = this.kernel.ports.createChannel()
          this.kernel.createInstance(Sub.typeId, this.kernel.createMessage({
            ports: [portRef4]
          }))
          this.kernel.ports.bind('test2', portRef3)
          this.kernel.send(portRef3, this.kernel.createMessage({
            data: 'getChannel'
          }))
        }
      }
    }

    class Sub extends BaseContainer {
      onMessage (message) {
        if (message.data === 'getChannel') {
          const ports = this.kernel.ports.createChannel()
          this.kernel.ports.bind('channel', ports[0])
          this.kernel.send(message.fromPort, this.kernel.createMessage({
            data: 'bindPort',
            ports: [ports[1]]
          }))
        } else if (message.data === 'bindPort') {
          this.kernel.ports.bind('channel', message.ports[0])
        }
      }
      static get typeId () {
        return 299
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(Root)
    hypervisor.registerContainer(Sub)

    const root = await hypervisor.createInstance(Root.typeId)

    const [portRef1, portRef2] = root.ports.createChannel()
    root.ports.bind('first', portRef1)
    root.createInstance(Root.typeId, root.createMessage({
      ports: [portRef2]
    }))

    root.send(portRef1, root.createMessage())

    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')

    t.end()
  })

  tape('response ports', async t => {
    t.plan(2)
    let runs = 0
    const returnValue = 'this is a test'

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

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer(testVMContainer)

    const rootContainer = await hypervisor.createInstance(testVMContainer.typeId)

    const [portRef1, portRef2] = rootContainer.ports.createChannel()
    const initMessage = rootContainer.createMessage({
      ports: [portRef2]
    })

    rootContainer.createInstance(testVMContainer.typeId, initMessage)

    rootContainer.ports.bind('first', portRef1)
    const message = rootContainer.createMessage()
    const rPort = rootContainer.getResponsePort(message)
    const rPort2 = rootContainer.getResponsePort(message)

    t.equals(rPort2, rPort)

    rootContainer.send(portRef1, message)
    rootContainer.ports.bind('response', rPort)
  })

  tape('start up', async t => {
    t.plan(1)
    class testVMContainer extends BaseContainer {
      onMessage () {}
      onStartup () {
        t.true(true, 'should start up')
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)
    await hypervisor.createInstance(testVMContainer.typeId)
    hypervisor.getInstance(hypervisor.ROOT_ID)
  })

  tape('large code size', async t => {
    t.plan(1)
    const content = Buffer.from(new ArrayBuffer(1000000))
    class testVMContainer extends BaseContainer {
      onMessage () {}
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer(testVMContainer)
    await hypervisor.createInstance(testVMContainer.typeId, new Message({data: content}))
    const instance = await hypervisor.getInstance(hypervisor.ROOT_ID)
    t.equals(content.length, instance.code.length)
  })
})
