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

  initailize (message) {
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
      '/': 'zdpuAyGKaZ3nbBQdgESbEgVYr81TcAFB6LE2MQQPWLZaYxuF3'
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
    rootContainer.ports.bind('first', port)
    rootContainer.send(port, message)

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
        const port = this.exInterface.ports.create('test2')
        this.exInterface.ports.bind('child', port)
        this.exInterface.incrementTicks(2)
        this.exInterface.send(port, m)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    let port = root.ports.create('test')

    root.ports.bind('first', port)
    message = root.createMessage()

    root.send(port, message)
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
        const port = this.exInterface.ports.create('test2')
        this.exInterface.ports.bind('child', port)
        this.exInterface.send(port, m)
        this.exInterface.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    const rootId = root.id
    let port = root.ports.create('test')

    root.ports.bind('first', port)
    message = root.createMessage()

    root.send(port, message)
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
    port = root.ports.get('first')
    root.send(port, message)
  })

  tape('traps', async t => {
    t.plan(1)
    class Root extends BaseContainer {
      async run (m) {
        const one = this.exInterface.ports.create('root')
        const two = this.exInterface.ports.create('root')
        const three = this.exInterface.ports.create('root')

        this.exInterface.ports.bind('one', one)
        this.exInterface.ports.bind('two', two)
        this.exInterface.ports.bind('three', three)

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
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('two', two)
          this.exInterface.ports.bind('one', one)

          this.exInterface.send(one, this.exInterface.createMessage())
          this.exInterface.send(two, this.exInterface.createMessage())
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('one', one)
          this.exInterface.ports.bind('two', two)

          Promise.all([
            this.exInterface.send(one, this.exInterface.createMessage()),
            this.exInterface.send(two, this.exInterface.createMessage())
          ])
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct oder if sent in order', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('one', one)
          this.exInterface.ports.bind('two', two)

          this.exInterface.send(one, this.exInterface.createMessage())
          this.exInterface.send(two, this.exInterface.createMessage())

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
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({data: 'first'}))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        this.exInterface.incrementTicks(2)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({data: 'second'}))
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('first', First)
    hypervisor.registerContainer('second', Second)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind('first', port)

    root.send(port, root.createMessage())
  })

  tape('saturation', async t => {
    t.plan(2)
    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('two', two)
          this.exInterface.ports.bind('one', one)

          Promise.all([
            this.exInterface.send(one, this.exInterface.createMessage()),
            this.exInterface.send(two, this.exInterface.createMessage())
          ])
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
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'first'
        }))
      }
    }

    class Second extends BaseContainer {
      run (m) {
        // this.exInterface.incrementTicks(3)
        this.exInterface.incrementTicks(3)
        this.exInterface.send(m.fromPort, this.exInterface.createMessage({
          data: 'second'
        }))
      }
    }

    class Waiter extends BaseContainer {
      initailize () {
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    const port1 = root.ports.create('waiter')
    root.ports.bind('sencond', port1)

    await root.send(port, root.createMessage())
    root.incrementTicks(7)

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, even in a tie of ticks', async t => {
    t.plan(2)

    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('two', two)
          this.exInterface.ports.bind('one', one)

          this.exInterface.send(one, this.exInterface.createMessage())
          this.exInterface.send(two, this.exInterface.createMessage())

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

    const port = root.ports.create('root')
    root.ports.bind('first', port)

    root.send(port, root.createMessage())
  })

  tape('message should arrive in the correct order, with a tie in ticks but with differnt proity', async t => {
    t.plan(2)

    let runs = 0

    class Root extends BaseContainer {
      run (m) {
        if (!runs) {
          runs++
          const one = this.exInterface.ports.create('first')
          const two = this.exInterface.ports.create('second')

          this.exInterface.ports.bind('one', one)
          this.exInterface.ports.bind('two', two)

          this.exInterface.send(two, this.exInterface.createMessage())
          this.exInterface.send(one, this.exInterface.createMessage())

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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
  })

  tape('send to the same container at the same time', async t => {
    t.plan(2)

    let runs = 0
    let instance

    class Root extends BaseContainer {
      run (m) {
        let one = this.exInterface.ports.get('one')
        if (!one) {
          one = this.exInterface.ports.create('first')
          this.exInterface.ports.bind('one', one)
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
    await hypervisor.createStateRoot()
    root.send(port, root.createMessage())
    await hypervisor.createStateRoot()
    t.equals(runs, 2)
  })
  tape('checking ports', async t => {
    t.plan(4)
    const hypervisor = new Hypervisor(node.dag)
    hypervisor.registerContainer('base', BaseContainer)

    const root = await hypervisor.createInstance('base')
    let port = root.ports.create('base')
    await root.ports.bind('test', port)

    try {
      root.createMessage({
        ports: [port]
      })
    } catch (e) {
      t.pass('should thow if sending a port that is bound')
    }

    try {
      await root.ports.bind('test', port)
    } catch (e) {
      t.pass('should thow if binding an already bound port')
    }

    try {
      let port2 = root.ports.create('base')
      await root.ports.bind('test', port2)
    } catch (e) {
      t.pass('should thow if binding an already bound name')
    }

    await root.ports.unbind('test')
    const message = root.createMessage({ports: [port]})
    t.equals(message.ports[0], port, 'should create a message if the port is unbound')
  })

  tape('port deletion', async t => {
    const expectedSr = {
      '/': 'zdpuB2QXxn1KQtLFfBqaritTRoe5BuKP5sNFSrPtRT6sxkY7Z'
    }
    class Root extends BaseContainer {
      run (m) {
        const one = this.exInterface.ports.create('first')
        this.exInterface.ports.bind('one', one)
        this.exInterface.send(one, this.exInterface.createMessage())
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
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
        this.exInterface.ports.create('sub')
      }
    }

    class Sub extends BaseContainer {
      initailize (message) {
        this.exInterface.ports.bind('root', message.ports[0])
        const port = this.exInterface.ports.create('root')
        this.exInterface.ports.bind('child', port)
      }
    }

    const hypervisor = new Hypervisor(node.dag)

    hypervisor.registerContainer('root', Root)
    hypervisor.registerContainer('sub', Sub)

    const root = await hypervisor.createInstance('root')
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
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
          // this.exInterface.ports.unbind('test2')
        } else {
          const port1 = this.exInterface.ports.create('sub')
          this.exInterface.ports.bind('test1', port1)
          const port2 = this.exInterface.ports.create('sub')
          this.exInterface.ports.bind('test2', port2)
          this.exInterface.send(port2, this.exInterface.createMessage({data: 'getChannel'}))
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
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
          const port1 = this.exInterface.ports.create('sub')
          this.exInterface.ports.bind('test1', port1)
          const port2 = this.exInterface.ports.create('sub')
          this.exInterface.ports.bind('test2', port2)
          this.exInterface.send(port2, this.exInterface.createMessage({data: 'getChannel'}))
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
    const port = root.ports.create('root')
    root.ports.bind('first', port)
    root.send(port, root.createMessage())
    const sr = await hypervisor.createStateRoot()
    t.deepEquals(sr, expectedSr, 'should produce the corret state root')

    t.end()
  })
})
