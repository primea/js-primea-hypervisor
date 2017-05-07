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

    try {
      const hypervisor = new Hypervisor({dag: node.dag})
      hypervisor.registerContainer('test', testVMContainer)

      const rootContainer = await hypervisor.createInstance('test')
      const port = await rootContainer.createPort('test', 'first')

      await rootContainer.send(port, message)

      const stateRoot = await hypervisor.createStateRoot(rootContainer, Infinity)
      t.deepEquals(stateRoot, expectedState, 'expected root!')
    } catch (e) {
      console.log(e)
    }
    t.end()
  })

  tape('one child contract', async t => {
    let message = new Message()
    const expectedState = {
      '/': 'zdpuAtYQujwQMR9SpmFwmkr7d2cD4vzeQk2GCzcEku2nomWj6'
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
        const port = this.kernel.getPort('child')
        this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    try {
      hypervisor.registerContainer('test', testVMContainer3)
      root = await hypervisor.createInstance('test', stateRoot)
      port = await root.ports.getRef('first')

      await root.send(port, message)
      console.log('creating SR')
      await hypervisor.createStateRoot(root, Infinity)
      console.log('end!')
      // console.log(hypervisor._vmInstances)
    } catch (e) {
      console.log(e)
    }

    t.end()
  })

  tape.skip('should wait on parent', async t => {
    let r
    const lock = new Promise((resolve, reject) => {
      r = resolve
    })

    let parentHasFinished = false
    let childHasFinished = false
    class testVMContainer extends BaseContainer {
      async run (m) {
        console.log('in parent')
        const port = await this.kernel.createPort(this.kernel.ports, 'test2', 'child')
        await this.kernel.send(port, m)
        await lock
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            console.log('parent done')
            this.kernel.incrementTicks(1)
            parentHasFinished = true
            t.equals(childHasFinished, false, 'child should not have finished at this point')
            resolve()
          }, 200)
        })
      }
    }

    // test reviving the state
    class testVMContainer2 extends BaseContainer {
      async run (m) {
        console.log('in child')
        childHasFinished = true
        r()
        this.kernel.incrementTicks(1)
        try {
          await this.kernel.ports.getNextMessage()
        } catch (e) {
          console.log(e)
        }
        t.equals(parentHasFinished, true, 'parent should have finished at this point')
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.addVM('test', testVMContainer)
    hypervisor.addVM('test2', testVMContainer2)
    const port = hypervisor.createPort('test')

    let message = new Message()
    try {
      await hypervisor.send(port, message)
      await hypervisor.createStateRoot(port, Infinity)
    } catch (e) {
      console.log(e)
    }

    t.end()
    node.stop(() => {
      process.exit()
    })
  })
})
