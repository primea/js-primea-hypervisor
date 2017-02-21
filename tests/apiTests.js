const tape = require('tape')
const Hypervisor = require('../hypervisor.js')
const Message = require('../message.js')

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
    })).catch(e => {
      console.log(e)
    })
  } catch (e) {
    console.log(e)
  }
})
