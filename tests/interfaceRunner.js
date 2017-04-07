const tape = require('tape')
const fs = require('fs')
const Graph = require('ipld-graph-builder')
const Block = require('../deps/block')
const U128 = require('fixed-bn.js').U128
const Address = require('fixed-bn.js').Address
// TODO remove fakeblockchain
const fakeBlockChain = require('../fakeBlockChain.js')
const Hypervisor = require('../hypervisor.js')
const Message = require('primea-message/atomic')
const common = require('../common')
const EVMinterface = require('../EVMinterface.js')
const IPFS = require('ipfs')

const ipfs = new IPFS()
const graph = new Graph(ipfs)

const dir = `${__dirname}/interface`
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
// tests = ['address.js']

ipfs.on('start', async () => {
  runTests(tests)
})

function runTests (tests) {
  tape('EVM interface tests', async(t) => {
    for (let testName of tests) {
      t.comment(testName)
      testName = testName.split('.')[0]
      const hypervisor = new Hypervisor(graph, {}, [EVMinterface])
      const envData = JSON.parse(fs.readFileSync(`${dir}/${testName}.json`).toString())
      const code = fs.readFileSync(`${dir}/${testName}.wasm`)
      envData.state[envData.address].code = code

      const block = new Block()
      block.header.coinbase = new Address(envData.coinbase)

      const message = new Message({
        to: `${envData.caller}/${common.PARENT}/${envData.address}/code`,
        data: Buffer.from(envData.callData.slice(2), 'hex'),
        value: new U128(envData.callValue),
        gas: envData.gasLeft,
        block: block,
        blockchain: fakeBlockChain
      })

      try {
        const results = await hypervisor.send('accounts', message)
        t.equals(results.exception, undefined)
      } catch (e) {
        console.log(e)
      }
    }
    t.end()
    process.exit()
  })
}
