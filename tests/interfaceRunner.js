'use strict'
const tape = require('tape')
const fs = require('fs')
const cp = require('child_process')

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

    const environment = new Environment(envData)
    const ethInterface = new Interface(environment)

    try {
      const mod = Wasm.instantiateModule(buffer, {'ethereum': ethInterface})
      ethInterface.setModule(mod)
      // ethInterface.address(0)
      // console.log(ethInterface.environment);
      mod.exports.test()
    } catch (e) {
      console.error('FAIL')
      console.error(e)
    } finally {
      console.log('done')
    }
    t.end()
  })
}
