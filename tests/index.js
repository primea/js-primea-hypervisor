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
      '/': 'zdpuB3eZQJuXMnQrdiF5seMvx3zC2xT1EqrQScoPcTs8ESxYx'
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.addVM('test', testVMContainer)
    const port = hypervisor.createPort('test')

    await hypervisor.send(port, message)
    await hypervisor.createStateRoot(port, Infinity)

    t.deepEquals(port, expectedState, 'expected')
    t.end()
  })

  tape('one child contract', async t => {
    let message = new Message()
    const expectedState = { '/': 'zdpuAqtY43BMaTCB5nTt7kooeKAWibqGs44Uwy9jJQHjTnHRK' }
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
        const port = await this.kernel.createPort(this.kernel.ports, 'test2', 'child')
        await this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.addVM('test', testVMContainer)
    hypervisor.addVM('test2', testVMContainer2)
    const port = hypervisor.createPort('test')

    await hypervisor.send(port, message)
    await hypervisor.createStateRoot(port, Infinity)
    t.true(hasResolved, 'should resolve before generating the state root')
    t.deepEquals(port, expectedState, 'expected state')

    // test reviving the state
    class testVMContainer3 extends BaseContainer {
      async run (m) {
        const port = this.kernel.getPort(this.kernel.ports, 'child')
        this.kernel.send(port, m)
        this.kernel.incrementTicks(1)
      }
    }

    hypervisor.addVM('test', testVMContainer3)

    // revive ports
    message = new Message()
    await hypervisor.graph.tree(expectedState, 1)
    await hypervisor.send(expectedState['/'], message)
    await hypervisor.createStateRoot(expectedState['/'], Infinity)

    t.end()
  })

  tape('should wiat on parent', async t => {
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
