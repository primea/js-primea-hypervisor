const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')
const Message = require('primea-message')

const node = new IPFS()

class BaseContainer {
  static createState (code) {
    return {
      nonce: Buffer.from([0]),
      ports: {}
    }
  }
}

node.on('error', err => {
  console.log(err)
})

node.on('start', () => {
  tape.only('basic', async t => {
    const message = new Message()
    const expectedState = { '/': 'zdpuB2hzCvqE34W71CFtqqzHLP8kyuwGZm1bz8Cy2kAVCh1fP' }

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
    // await hypervisor.graph.tree(port, Infinity)
    // console.log(JSON.stringify(port, null, 2))
    t.end()
  })

  tape('one child contract', async t => {
    t.end()
    const message = new Message()
    const expectedState = { '/': 'zdpuAwqyF4X1hAHMBcsn7eDJXcLfcyoyEWWR73eeqXXmFkBe3' }

    class testVMContainer2 extends BaseContainer {
      run (m) {
        console.log('here!')
        t.true(m === message, 'should recive a message')
      }
    }

    class testVMContainer extends BaseContainer {
      constructor (kernel) {
        super()
        this.kernel = kernel
      }

      async run (m) {
        console.log('first')
        const port = await this.kernel.createPort(this.kernel.ports, 'test2', 'child')
        return this.kernel.send(port, m)
      }
    }

    const hypervisor = new Hypervisor({dag: node.dag})
    hypervisor.addVM('test', testVMContainer)
    hypervisor.addVM('test2', testVMContainer2)
    const port = hypervisor.createPort('test')

    await hypervisor.send(port, message)
    await hypervisor.createStateRoot(port, Infinity)
    t.deepEquals(port, expectedState, 'expected')

    node.stop(() => {
      process.exit()
    })
  })
})
