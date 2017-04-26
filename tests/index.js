const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')
const Message = require('primea-message')

const node = new IPFS()
node.on('error', err => {
  console.log(err)
})

node.on('start', () => {
  tape('basic', async t => {
    const message = new Message()
    const state = {
      messages: [],
      id: {
        '/': {
          nonce: new Buffer([0]),
          parent: {
            '/': null
          }
        }
      },
      type: 'test',
      vm: {
        '/': {
          ports: {}
        }
      }
    }
    const expectedState = { '/': 'zdpuAnCsh9tVFa3asqkC7iNkwK6dYyZqJDxQrB7PMt8foLRKJ' }

    class testVMContainer {
      run (m) {
        t.true(m === message, 'should recive a message')
      }
    }

    try {
      const hypervisor = new Hypervisor({
        dag: node.dag
      })
      hypervisor.addVM('test', testVMContainer)

      await hypervisor.send(state, message)
      await hypervisor.createStateRoot(state, Infinity)
      console.log('state root')
      t.deepEquals(state, expectedState, 'expected')
      t.end()
    } catch (e) {
      console.log(e)
    }
  })

  tape('one child contract', t => {
    t.end()
    node.stop(() => {
      process.exit()
    })

    const message = new Message()
    class testVMContainer {
      constuctor (kernel) {
        this.kernel = kernel
      }

      run (m) {
        
      }
    }

    // const state = {
    //   id: {},
    //   ports: {
    //     first: {
    //       id: {
    //         nonce: 1,
    //         parent: 'hash'
    //       },
    //       code: 'js code',
    //       type: 'test',
    //       ports: {

    //       }
    //     }
    //   }
    // }
    // const message = new Message({
    //   type: 'create',
    //   path: 'first',
    //   data: jsCode
    // })
    // hypervisor.send(port, message)

  })
})
