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
    const testVM = {
      run (message) {
        console.log('made it!!!!')
      }
    }

    try {
      const state = {
        id: {
          nonce: new Uint8Array([0]),
          parent: new Uint8Array()
        },
        type: 'test',
        vm: {
          ports: {}
        }
      }

      const hypervisor = new Hypervisor(node.dag)
      hypervisor.addVM('test', testVM)

      const message = new Message()
      await hypervisor.send(state, message)

      await hypervisor.createStateRoot(state, Infinity)
      console.log(state)

      node.stop(() => {
        t.end()
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
