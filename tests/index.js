const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')

const node = new IPFS({
  start: false
})

class BaseContainer {
  constructor (kernel) {
    this.kernel = kernel
  }

  static createState (code) {
    return {
      nonce: [0],
      ports: {}
    }
  }
}

node.on('ready', () => {
  tape('basic', async t => {
    t.plan(2)
    let message
    const expectedState = {
      '/': 'zdpuAntkdU7yBJojcBT5Q9wBhrK56NmLnwpHPKaEGMFnAXpv7'
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)

    const rootContainer = await hypervisor.createInstance('test')
    const port = rootContainer.ports.create('test')
    message = rootContainer.createMessage()
    rootContainer.ports.bind(port, 'first')

    await rootContainer.send(port, message)

    const stateRoot = await hypervisor.createStateRoot(rootContainer, Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
  })

  tape('one child contract', async t => {
    t.plan(4)
    let message
    const expectedState = {
      '/': 'zdpuAofSzrBqwYs6z1r28fMeb8z5oSKF6CcWA6m22RqazgoTB'
    }
    let hasResolved = false

    class testVMContainer2 extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message 2')
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this.kernel.incrementTicks(1)
            hasResolved = true
            resolve()
          }, 200)
        })
      }
    }

    class testVMContainer extends BaseContainer {
      async run (m) {
        const port = this.kernel.ports.create('test2')
        this.kernel.ports.bind(port, 'child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    let port = root.ports.create('test')

    root.ports.bind(port, 'first')
    message = root.createMessage()

    await root.send(port, message)
    const stateRoot = await hypervisor.createStateRoot(root, Infinity)
    t.true(hasResolved, 'should resolve before generating the state root')
    t.deepEquals(stateRoot, expectedState, 'expected state')

    // test reviving the state
    class testVMContainer3 extends BaseContainer {
      async run (m) {
        const port = this.kernel.ports.get('child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    hypervisor.registerContainer('test', testVMContainer3)
    root = await hypervisor.createInstance('test', stateRoot)
    port = root.ports.get('first')

    root.send(port, message)
  })

  tape('ping pong', async t => {
    class Ping extends BaseContainer {
      async run (m) {
        let port = this.kernel.ports.get('child')
        if (!port) {
          port = this.kernel.ports.create('pong')
          this.kernel.ports.bind(port, 'child')
        }

        if (this.kernel.ticks < 100) {
          this.kernel.incrementTicks(1)
          return this.kernel.send(port, this.kernel.createMessage())
        }
      }
    }

    class Pong extends BaseContainer {
      run (m) {
        const port = m.fromPort
        this.kernel.incrementTicks(2)
        return this.kernel.send(port, this.kernel.createMessage())
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('ping', Ping)
    hypervisor.registerContainer('pong', Pong)
    const root = await hypervisor.createInstance('pong')
    const port = root.ports.create('ping')
    root.ports.bind(port, 'child')

    await root.send(port, root.createMessage())
    await hypervisor.createStateRoot(root, Infinity)

    t.end()
  })

  tape('queing multiple messages', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      async run (m) {
        const one = this.kernel.ports.create('child')
        const two = this.kernel.ports.create('child')
        const three = this.kernel.ports.create('child')

        this.kernel.ports.bind(one, 'one')
        this.kernel.ports.bind(two, 'two')
        this.kernel.ports.bind(three, 'three')

        await Promise.all([
          this.kernel.send(one, this.kernel.createMessage()),
          this.kernel.send(two, this.kernel.createMessage()),
          this.kernel.send(three, this.kernel.createMessage())
        ])

        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this.kernel.incrementTicks(6)
            resolve()
          }, 200)
        })
      }
    }

    class Child extends BaseContainer {
      run (m) {
        runs++
        this.kernel.incrementTicks(2)
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('child', Child)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind(port, 'first')

    await root.send(port, root.createMessage())
    await root.wait(Infinity)

    t.equals(runs, 3, 'the number of run should be 3')
    const nonce = await hypervisor.graph.get(root.state, 'ports/first/link/nonce/0')
    t.equals(nonce, 3, 'should have the correct nonce')
  })

  tape('traps', async t => {
    t.plan(1)
    class Root extends BaseContainer {
      async run (m) {
        const one = this.kernel.ports.create('child')
        const two = this.kernel.ports.create('child')
        const three = this.kernel.ports.create('child')

        this.kernel.ports.bind(one, 'one')
        this.kernel.ports.bind(two, 'two')
        this.kernel.ports.bind(three, 'three')

        throw new Error('it is a trap!!!')
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    const root = await hypervisor.createInstance('root')
    await root.run()

    t.deepEquals(root.state, {
      '/': {
        nonce: [0],
        ports: {}
      }
    }, 'should revert the state')
  })

  tape('invalid port referances', async t => {
    t.plan(2)
    class Root extends BaseContainer {
      async run (m) {
        const port = this.kernel.ports.create('root')
        this.kernel.ports.bind(port, 'three')
        this.kernel.ports.unbind('three')
        try {
          await this.kernel.send(port, this.kernel.createMessage())
        } catch (e) {
          t.pass()
        }
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    const root = await hypervisor.createInstance('root')
    await root.run()

    t.deepEquals(root.state, {
      '/': {
        nonce: [1],
        ports: {}
      }
    })
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first')
          const two = this.kernel.ports.create('second')

          this.kernel.ports.bind(one, 'one')
          this.kernel.ports.bind(two, 'two')

          await Promise.all([
            this.kernel.send(one, this.kernel.createMessage()),
            this.kernel.send(two, this.kernel.createMessage())
          ])

          this.kernel.incrementTicks(6)
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(1)
        await this.kernel.send(m.fromPort, this.kernel.createMessage({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, this.kernel.createMessage({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind(port, 'first')

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, even if sent out of order', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first')
          const two = this.kernel.ports.create('second')

          this.kernel.ports.bind(one, 'one')
          this.kernel.ports.bind(two, 'two')

          return Promise.all([
            this.kernel.send(one, this.kernel.createMessage()),
            this.kernel.send(two, this.kernel.createMessage())
          ])
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'second', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'first', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(1)
        this.kernel.send(m.fromPort, this.kernel.createMessage({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind(port, 'first')

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first')
          const two = this.kernel.ports.create('second')

          this.kernel.ports.bind(one, 'one')
          this.kernel.ports.bind(two, 'two')

          await Promise.all([
            this.kernel.send(one, this.kernel.createMessage()),
            this.kernel.send(two, this.kernel.createMessage())
          ])

          this.kernel.incrementTicks(6)
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'first', 'should recived the second message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'second', 'should recive the first message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root')
    root.ports.bind(port, 'first')
    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      run (m) {
        if (!this.runs) {
          this.runs = 1
          const two = this.kernel.ports.create('second')
          const one = this.kernel.ports.create('first')

          this.kernel.ports.bind(two, 'two')
          this.kernel.ports.bind(one, 'one')

          return Promise.all([
            this.kernel.send(two, this.kernel.createMessage()),
            this.kernel.send(one, this.kernel.createMessage())
          ])
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'second', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'first', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')

    const port = root.ports.create('root')
    root.ports.bind(port, 'first')

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first')
          const two = this.kernel.ports.create('second')

          this.kernel.ports.bind(one, 'one')
          this.kernel.ports.bind(two, 'two')

          return Promise.all([
            this.kernel.send(two, this.kernel.createMessage()),
            this.kernel.send(one, this.kernel.createMessage())
          ])
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'first', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'second', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          resources: {
            priority: 100
          },
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind(port, 'first')
    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      run (m) {
        if (!this.runs) {
          this.runs = 1

          const one = this.kernel.ports.create('first')
          const two = this.kernel.ports.create('second')

          this.kernel.ports.bind(one, 'one')
          this.kernel.ports.bind(two, 'two')

          return Promise.all([
            this.kernel.send(two, this.kernel.createMessage()),
            this.kernel.send(one, this.kernel.createMessage())
          ])
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'second', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'first', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          resources: {
            priority: 100
          },
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind(port, 'first')
    root.send(port, root.createMessage())
  })

  tape('should order parent messages correctly', async t => {
    t.plan(1)
    class Middle extends BaseContainer {
      run (m) {
        if (!this.runs) {
          this.runs = 1
          this.kernel.incrementTicks(1)

          const leaf = this.kernel.ports.create('leaf')
          this.kernel.ports.bind(leaf, 'leaf')

          return this.kernel.send(leaf, this.kernel.createMessage())
        } else {
          ++this.runs
          if (this.runs === 3) {
            t.equals(m.data, 'first')
          }
        }
      }
    }

    class Leaf extends BaseContainer {
      run (m) {
        this.kernel.incrementTicks(2)
        return this.kernel.send(m.fromPort, this.kernel.createMessage({
          data: 'first'
        }))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', BaseContainer)
    hypervisor.registerContainer('middle', Middle)
    hypervisor.registerContainer('leaf', Leaf)

    const root = await hypervisor.createInstance('root')
    root.incrementTicks(2)

    const port = root.ports.create('middle')
    root.ports.bind(port, 'first')

    await root.send(port, root.createMessage())
    root.send(port, root.createMessage())
  })

  tape('get container instance by path', async t => {
    t.plan(1)
    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('base', BaseContainer)

    const root = await hypervisor.createInstance('base')
    let port = root.ports.create('base')
    root.ports.bind(port, 'first')

    const first = await root.getInstance(port)
    port = first.ports.create('base')
    first.ports.bind(port, 'second')

    const second = await first.getInstance(port)
    port = second.ports.create('base')
    second.ports.bind(port, 'third')

    const third = await second.getInstance(port)
    const foundThird = await hypervisor.getInstanceByPath(root, 'first/second/third')
    t.equals(third, foundThird, 'should find by path')
  })

  tape('checking ports', async t => {
    t.plan(5)
    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('base', BaseContainer)

    const root = await hypervisor.createInstance('base')
    let port = root.ports.create('base')
    root.ports.bind(port, 'test')

    t.equals(root.ports.getBoundName(port), 'test', 'should get the ports name')

    try {
      root.createMessage({
        ports: [port]
      })
    } catch (e) {
      t.pass('should thow if sending a port that is bound')
    }

    try {
      root.ports.bind(port, 'test')
    } catch (e) {
      t.pass('should thow if binding an already bound port')
    }

    try {
      let port2 = root.ports.create('base')
      root.ports.bind(port2, 'test')
    } catch (e) {
      t.pass('should thow if binding an already bound name')
    }

    root.ports.unbind('test')
    const message = root.createMessage({ports: [port]})
    t.equals(message.ports[0], port, 'should create a message if the port is unbound')
  })
})
