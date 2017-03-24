const tape = require('tape')
const fs = require('fs')
const Vertex = require('merkle-trie')
const Block = require('../deps/block')
const U128 = require('fixed-bn.js').U128
const Address = require('fixed-bn.js').Address
// TODO remove fakeblockchain
const fakeBlockChain = require('../fakeBlockChain.js')
const Hypervisor = require('../hypervisor.js')
const Message = require('../message.js')
const common = require('../common')
const EVMinterface = require('../EVMinterface.js')

const dir = `${__dirname}/interface`
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
runTests(tests)

function runTests (tests) {
  for (let testName of tests) {
    testName = testName.split('.')[0]
    tape(testName, async (t) => {
      const hypervisor = new Hypervisor(new Vertex(), [EVMinterface])
      const rootVertex = hypervisor.state
      const code = fs.readFileSync(`${dir}/${testName}.wasm`)
      const envData = JSON.parse(fs.readFileSync(`${dir}/${testName}.json`).toString())

      for (let address in envData.state) {
        const account = envData.state[address]
        const accountVertex = new Vertex()

        accountVertex.set('code', new Vertex({
          value: code
        }))

        accountVertex.set('balance', new Vertex({
          value: new Buffer(account.balance.slice(2), 'hex')
        }))

        for (let key in account.storage) {
          accountVertex.set(['storage', ...new Buffer(key.slice(2), 'hex')], new Vertex({
            value: new Buffer(account.storage[key].slice(2), 'hex')
          }))
        }

        const path = ['accounts', address]
        rootVertex.set(path, accountVertex)
      }

      rootVertex.set('blockchain', new Vertex({
        value: fakeBlockChain
      }))

      const block = new Block()
      block.header.coinbase = new Address(envData.coinbase)

      const message = new Message()
      message.to = ['accounts', envData.caller, common.PARENT, envData.address, 'code']
      message.data = new Buffer(envData.callData.slice(2), 'hex')
      message.value = new U128(envData.callValue)
      message.gas = envData.gasLeft
      message.block = block
      message.blockchain = fakeBlockChain

      const results = await hypervisor.send(message)
      t.equals(results.exception, undefined)
      t.end()
    })
  }
}
