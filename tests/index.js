const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')
const Message = require('primea-message')

const node = new IPFS()

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

node.on('error', err => {
  console.log(err)
})

node.on('start', () => {
  tape.onFinish(() => {
    node.stop(() => {
      process.exit()
    })
  })

  tape('basic', async t => {
    t.plan(2)
    const message = new Message()
    const expectedState = {
      '/': 'zdpuAntkdU7yBJojcBT5Q9wBhrK56NmLnwpHPKaEGMFnAXpv7'
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.registerContainer('test', testVMContainer)

    const rootContainer = await hypervisor.createInstance('test')
    const port = await rootContainer.ports.create('test', 'first')

    await rootContainer.send(port, message)

    const stateRoot = await hypervisor.createStateRoot(rootContainer, Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
  })

  tape('one child contract', async t => {
    t.plan(4)
    let message = new Message()
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
        const port = await this.kernel.ports.create('test2', 'child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    let port = await root.ports.create('test', 'first')

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
    port = await root.ports.get('first')

    await root.send(port, message)
  })

  tape('ping pong', async t => {
    class Ping extends BaseContainer {
      async run (m) {
        let port = this.kernel.ports.get('child')
        if (!port) {
          port = await this.kernel.ports.create('pong', 'child')
        }

        if (this.kernel.ticks < 100) {
          this.kernel.incrementTicks(1)
          return this.kernel.send(port, new Message())
        }
      }
    }

    class Pong extends BaseContainer {
      run (m) {
        const port = m.fromPort
        this.kernel.incrementTicks(2)
        return this.kernel.send(port, new Message())
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('ping', Ping)
    hypervisor.registerContainer('pong', Pong)
    const root = await hypervisor.createInstance('pong')
    const port = await root.ports.create('ping', 'child')

    await root.send(port, new Message())
    await hypervisor.createStateRoot(root, Infinity)

    t.end()
  })

  tape('queing multiple messages', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      async run (m) {
        const one = this.kernel.ports.create('child', 'one')
        const two = this.kernel.ports.create('child', 'two')
        const three = this.kernel.ports.create('child', 'three')

        await Promise.all([
          this.kernel.send(one, new Message()),
          this.kernel.send(two, new Message()),
          this.kernel.send(three, new Message())
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

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('child', Child)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
    await root.wait(Infinity)

    t.equals(runs, 3, 'the number of run should be 3')
    const nonce = await hypervisor.graph.get(root.state, 'ports/first/link/nonce/0')
    t.equals(nonce, 3, 'should have the correct nonce')
  })

  tape('traps', async t => {
    t.plan(1)
    class Root extends BaseContainer {
      async run (m) {
        await Promise.all([
          this.kernel.ports.create('root', 'one'),
          this.kernel.ports.create('root', 'two'),
          this.kernel.ports.create('root', 'three')
        ])

        throw new Error('it is a trap!!!')
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

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

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first', 'one')
          const two = this.kernel.ports.create('second', 'two')

          await Promise.all([
            this.kernel.send(one, new Message()),
            this.kernel.send(two, new Message())
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
        await this.kernel.send(m.fromPort, new Message({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('message should arrive in the correct order, even if sent out of order', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first', 'one')
          const two = this.kernel.ports.create('second', 'two')

          await Promise.all([
            this.kernel.send(one, new Message()),
            this.kernel.send(two, new Message())
          ])

          this.kernel.incrementTicks(6)
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'second', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'first', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(1)
        await this.kernel.send(m.fromPort, new Message({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first', 'one')
          const two = this.kernel.ports.create('second', 'two')

          await Promise.all([
            this.kernel.send(one, new Message()),
            this.kernel.send(two, new Message())
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
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const two = this.kernel.ports.create('second', 'two')
          const one = this.kernel.ports.create('first', 'one')

          await Promise.all([
            this.kernel.send(two, new Message()),
            this.kernel.send(one, new Message())
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
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first', 'one')
          const two = this.kernel.ports.create('second', 'two')

          await Promise.all([
            this.kernel.send(two, new Message()),
            this.kernel.send(one, new Message())
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
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({
          resources: {
            priority: 100
          },
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    class Root extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          const one = this.kernel.ports.create('first', 'one')
          const two = this.kernel.ports.create('second', 'two')

          await Promise.all([
            this.kernel.send(two, new Message()),
            this.kernel.send(one, new Message())
          ])

          this.kernel.incrementTicks(6)
        } else if (this.runs === 1) {
          this.runs++
          t.equals(m.data, 'second', 'should recive the first message')
        } else if (this.runs === 2) {
          t.equals(m.data, 'first', 'should recived the second message')
        }
      }
    }

    class First extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({
          resources: {
            priority: 100
          },
          data: 'second'
        }))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = await root.ports.create('root', 'first')
    await root.send(port, new Message())
  })

  tape('should order parent messages correctly', async t => {
    t.plan(1)
    class Middle extends BaseContainer {
      async run (m) {
        if (!this.runs) {
          this.runs = 1
          this.kernel.incrementTicks(1)
          const leaf = this.kernel.ports.create('leaf', 'leaf')
          await this.kernel.send(leaf, new Message())
        } else {
          ++this.runs
          if (this.runs === 3) {
            t.equals(m.data, 'first')
          }
        }
      }
    }

    class Leaf extends BaseContainer {
      async run (m) {
        this.kernel.incrementTicks(2)
        await this.kernel.send(m.fromPort, new Message({
          data: 'first'
        }))
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    hypervisor.registerContainer('root', BaseContainer)
    hypervisor.registerContainer('middle', Middle)
    hypervisor.registerContainer('leaf', Leaf)

    const root = await hypervisor.createInstance('root')
    root.incrementTicks(2)

    const port = await root.ports.create('middle', 'first')

    await root.send(port, new Message())
    await root.send(port, new Message())
  })
})

