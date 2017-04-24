const tape = require('tape')
const IPFS = require('ipfs')
const Hypervisor = require('../')
const Message = require('primea-message')

const node = new IPFS()
node.on('error', err => {
  console.log(err)
})

node.on('start', () => {
  tape.only('basic', async t => {
    const message = new Message()
    class testVM {
      run (m) {
        t.true(m === message, 'should recive a message')
        t.end()
      }
    }

    try {
      const state = {
        id: {
          nonce: new Buffer([0]),
          parent: new Buffer([])
        },
        type: 'test',
        vm: {
          ports: {}
        }
      }

      const expectedState = { '/': 'zdpuApqUjZFhw8LTkw8gXAbVcqc5Y7TsbTVadU879TgucoqSF' }

      const hypervisor = new Hypervisor({
        dag: node.dag
      })
      hypervisor.addVM('test', testVM)

      await hypervisor.send(state, message)

      await hypervisor.createStateRoot(state, Infinity)
      t.deepEquals(state, expectedState, 'expected')

      node.stop(() => {
        process.exit()
      })
    } catch (e) {
      console.log(e)
    }
  })

  tape('messaging', t => {
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
