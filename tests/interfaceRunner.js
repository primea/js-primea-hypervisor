'use strict'
const tape = require('tape')
const fs = require('fs')
const cp = require('child_process')

const Kernel = require('../index.js')
const Environment = require('../environment.js')
const Interface = require('../interface.js')
const dir = __dirname + '/interface'
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
// tests = ['balance.wast']
// run the tests
for (let testName of tests) {
  testName = testName.split('.')[0]
  tape(testName, (t) => {
    // Compile Command
    cp.execSync(`${__dirname}/../../evm-wasm-transcompiler/deps/sexpr-wasm-prototype/out/sexpr-wasm  ${dir}/${testName}.wast -o ${dir}/${testName}.wasm`)
    const buffer = fs.readFileSync(`${dir}/${testName}.wasm`)
    const envData = fs.readFileSync(`${dir}/${testName}.json`)
    const ethereum     = new Kernel(new Environment(envData))

    // manually `callHander`
    const environment  = new Environment(envData)
    environment.parent = ethereum
    const testContract = new Kernel(environment)
    const ethInterface = new Interface(environment, testContract)

    try {
      const mod = Wasm.instantiateModule(buffer, { 'ethereum': ethInterface.exportTable })
      ethInterface.setModule(mod)
      mod.exports.test()
    } catch (e) {
      t.fail()
      console.error('FAIL')
      console.error(e)
    } finally {
      t.pass(testName)
      console.log('done')
    }
    t.end()
  })
}
