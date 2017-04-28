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
  tape.only('basic', async t => {
    const message = new Message()
    const expectedState = {
      '/': 'zdpuAn1R5shTypKNBHT8Js2uBnbUcujHfnPNrKbKRNL1AyAt5'
    }

    class testVMContainer extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    try {
      const hypervisor = new Hypervisor({dag: node.dag})
      hypervisor.addVM('test', testVMContainer)
      const port = hypervisor.createPort('test')

      await hypervisor.send(port, message)
      await hypervisor.createStateRoot(port, Infinity)

      t.deepEquals(port, expectedState, 'expected')
    } catch (e) {
      console.log(e)
    }
    t.end()
  })

  tape('one child contract', async t => {
    const message = new Message()
    const expectedState = {
      '/': 'zdpuAwUPELiXpnd66Wum84VRPEsUGB7cUuxUESDMXmpVj6prc'
    }

    class testVMContainer2 extends BaseContainer {
      run (m) {
        t.true(m === message, 'should recive a message 2')
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            console.log('resolve!!')
            this.kernel.incrementTicks(1)
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

    try {
      const hypervisor = new Hypervisor({dag: node.dag})
      hypervisor.addVM('test', testVMContainer)
      hypervisor.addVM('test2', testVMContainer2)
      const port = hypervisor.createPort('test')

      await hypervisor.send(port, message)
      await hypervisor.createStateRoot(port, Infinity)
      console.log('create state root')

      // await hypervisor.graph.tree(port, Infinity)
      // console.log(JSON.stringify(port, null, 2))
      // t.deepEquals(port, expectedState, 'expected')
    } catch (e) {
      console.log(e)
    }

    t.end()
    node.stop(() => {
      // process.exit()
    })
  })
})
