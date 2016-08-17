'use strict'
const tape = require('tape')
const fs = require('fs')
const cp = require('child_process')

const Kernel = require('../index.js')
const TestEnvironment = require('../testEnvironment.js')
const Interface = require('../interface.js')
const DebugInterface = require('../debugInterface.js')
const dir = __dirname + '/interface'
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
// tests = ['balance.wast']
// run the tests
for (let testName of tests) {
  testName = testName.split('.')[0]
  tape(testName, (t) => {
    // Compile Command
    cp.execSync(`${__dirname}/../tools/sexpr-wasm-prototype/out/sexpr-wasm ${dir}/${testName}.wast -o ${dir}/${testName}.wasm`)
    const buffer = fs.readFileSync(`${dir}/${testName}.wasm`)
    const envData = fs.readFileSync(`${dir}/${testName}.json`).toString()
    const ethereum     = new Kernel(new TestEnvironment(envData))

    // manually `callHander`
    const environment  = new TestEnvironment(envData)
    environment.parent = ethereum
    const testContract = new Kernel(environment)
    const ethInterface = new Interface(environment, testContract)
    const debugInterface = new DebugInterface()

    try {
      const mod = Wasm.instantiateModule(buffer, {
        'ethereum': ethInterface.exportTable,
        'debug': debugInterface.exportTable
      })
      ethInterface.setModule(mod)
      debugInterface.setModule(mod)
      mod.exports.test()
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
