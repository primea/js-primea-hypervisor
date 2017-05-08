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
  tape('basic', async t => {
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
    const port = await rootContainer.createPort('test', 'first')

    await rootContainer.send(port, message)

    const stateRoot = await hypervisor.createStateRoot(rootContainer, Infinity)
    t.deepEquals(stateRoot, expectedState, 'expected root!')
    t.end()
  })

  tape('one child contract', async t => {
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
        const port = await this.kernel.createPort('test2', 'child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.registerContainer('test', testVMContainer)
    hypervisor.registerContainer('test2', testVMContainer2)

    let root = await hypervisor.createInstance('test')
    let port = await root.createPort('test', 'first')

    await root.send(port, message)
    const stateRoot = await hypervisor.createStateRoot(root, Infinity)
    t.true(hasResolved, 'should resolve before generating the state root')
    t.deepEquals(stateRoot, expectedState, 'expected state')

    // test reviving the state
    class testVMContainer3 extends BaseContainer {
      async run (m) {
        const port = this.kernel.ports.getRef('child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    hypervisor.registerContainer('test', testVMContainer3)
    root = await hypervisor.createInstance('test', stateRoot)
    port = await root.ports.getRef('first')

    await root.send(port, message)
    await hypervisor.createStateRoot(root, Infinity)

    t.end()

    node.stop(() => {
      process.exit()
    })
  })

  tape.skip('ping pong', async t => {
    class Ping extends BaseContainer {
      async run (m) {
        console.log('ping')
        let port = this.kernel.ports.getRef('child')
        if (!port) {
          port = await this.kernel.createPort('pong', 'child')
        }

        if (this.kernel.ticks < 100) {
          this.kernel.incrementTicks(1)
          console.log('here')
          return this.kernel.send(port, new Message())
        }
      }
    }

    class Pong extends BaseContainer {
      run (m) {
        console.log('pong')
        const port = m.fromPort
        return this.kernel.send(port, new Message())
      }
    }

    const hypervisor = new Hypervisor({
      dag: node.dag
    })

    try {
      hypervisor.registerContainer('ping', Ping)
      hypervisor.registerContainer('pong', Pong)
      const root = await hypervisor.createInstance('pong')
      const port = await root.createPort('ping', 'child')

      await root.send(port, new Message())
    } catch (e) {
      console.log(e)
    }
  })
})
