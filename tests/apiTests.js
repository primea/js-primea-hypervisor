const tape = require('tape')
const Hypervisor = require('../hypervisor.js')
const Message = require('primea-message/atomic')
const Graph = require('ipld-graph-builder')
const IPFS = require('ipfs')

const ipfs = new IPFS()
const graph = new Graph(ipfs)

ipfs.on('start', async () => {
  tape('send and reciving messages', async t => {
    const root = {}
    try {
      const hypervisor = new Hypervisor(graph, root)
      const path = 'two/three'
      await hypervisor.set(path, {
        code: message => {
          t.pass('got message')
          t.end()
          return {}
        }
      })
      hypervisor.send('one', new Message({
        to: path
      }))
    } catch (e) {
      console.log(e)
    }
  })

  tape('reverts', async t => {
    try {
      const root = {}
      const hypervisor = new Hypervisor(graph, root)
      const path = 'one/two/three'
      const path2 = 'one/two/three/four'
      await hypervisor.set(path, {
        code: async (message, kernel) => {
          console.log('here!!')
          await kernel.send('four', new Message())
          throw new Error('vm exception')
        }
      })

      await hypervisor.set(path2, {
        code: (message, kernel) => {
          kernel.graph.set(kernel.state, 'something', {
            somevalue: 'value'
          })
          return 'done!'
        }
      })

      const message = new Message({
        to: path.split('/').slice(1)
      })
      hypervisor.send(path.split('/')[0], message)
      const result = await message.result()
      t.equals(result.exception, true)
      const expectedRoot = '{"one":{"two":{"three":{"/":{"four":{"/":{}}}}}}}'
      t.equals(JSON.stringify(root), expectedRoot, 'should produce correct root')
    } catch (e) {
      console.log(e)
    }
    t.end()
    process.exit()
  })
})
