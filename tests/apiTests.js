const tape = require('tape')
const Hypervisor = require('../hypervisor.js')
const Message = require('../message.js')
const Vertex = require('merkle-trie')

tape('send and reciving messages', async t => {
  try {
    const hypervisor = new Hypervisor()
    const path = ['one', 'two', 'three']
    hypervisor.set(path, {
      run: message => {
        t.pass('got message')
        t.end()
        return {}
      }
    })
    hypervisor.send(new Message({
      to: path
    }))
  } catch (e) {
    console.log(e)
  }
})

tape('reverts', async t => {
  const hypervisor = new Hypervisor()
  const path = ['one', 'two', 'three']
  const path2 = ['one', 'two', 'three', 'four']
  hypervisor.set(path, {
    run: async (message, kernel) => {
      await kernel.send(new Message({
        to: ['four']
      }))
      throw new Error('vm exception')
    }
  })

  hypervisor.set(path2, {
    run: (message, kernel) => {
      kernel.stateInterface.set('key', new Vertex({
        value: 'value'
      }))
    }
  })

  const message = new Message({
    to: path
  })
  hypervisor.send(message)
  const result = await message.result()
  t.equals(result.exception, true)
  t.end()
})
