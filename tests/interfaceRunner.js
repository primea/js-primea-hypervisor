const tape = require('tape')
const fs = require('fs')
const path = require('path')
const Vertex = require('merkle-trie')
const Address = require('../deps/address')
const U256 = require('../deps/u256')

const Kernel = require('../index.js')
const Environment = require('../testEnvironment.js')

const dir = path.join(__dirname, '/interface')
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
// tests = ['callDataSize.wast']

runTests(tests)

function runTests (tests) {
  for (let testName of tests) {
    testName = testName.split('.')[0]
    tape(testName, async (t) => {
      // Compile Command
      const rootVertex = new Vertex()
      const code = fs.readFileSync(`${dir}/${testName}.wasm`)
      const envData = JSON.parse(fs.readFileSync(`${dir}/${testName}.json`).toString())

      envData.caller = new Address(envData.caller)
      envData.address = new Address(envData.address)
      envData.origin = new Address(envData.origin)
      envData.callData = new Buffer(envData.callData.slice(2), 'hex')
      envData.callValue = new U256(envData.callValue)

      for (let address in envData.state) {
        const account = envData.state[address]
        const accountVertex = new Vertex()

        accountVertex.set('code', new Vertex({
          value: new Buffer(account.code.slice(2), 'hex')
        }))

        accountVertex.set('balance', new Vertex({
          value: new Buffer(account.balance.slice(2), 'hex')
        }))

        for (let key in account.storage) {
          accountVertex.set(['storage', ...new Buffer(key.slice(2), 'hex')], new Vertex({
            value: new Buffer(account.storage[key].slice(2), 'hex')
          }))
        }

        const path = ['accounts', ...new Buffer(address.slice(2), 'hex')]
        rootVertex.set(path, accountVertex)
      }

      const state = envData.state = await rootVertex.get(['accounts', ...envData.address.toBuffer()])
      state.value = code

      const env = new Environment(envData)
      env.block.header.coinbase = new Address(envData.coinbase)

      rootVertex.set('block', new Vertex({
        value: env.block
      }))

      const kernel = new Kernel({
        state: state
      })

      try {
        await kernel.run(env)
      } catch (e) {
        t.fail('Exception: ' + e)
        console.error('FAIL')
        console.error(e)
      } finally {
        t.pass(testName)
        console.log('done')
      }
      t.end()
    })
  }
}
