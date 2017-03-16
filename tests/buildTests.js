const fs = require('fs')
const cp = require('child_process')
const path = require('path')

const dir = path.join(__dirname, '/interface')
// get the test names
let tests = fs.readdirSync(dir).filter((file) => file.endsWith('.wast'))
// tests = ['balance.wast']
// run the tests
for (let testName of tests) {
  console.log(testName)
  testName = testName.split('.')[0]
  // Compile Command
  cp.execSync(`${__dirname}/../tools/wabt/out/wast2wasm ${dir}/${testName}.wast -o ${dir}/${testName}.wasm`)
}
