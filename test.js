const Kernel = require('./index.js')
const Environment = require('./environment.js')

const environment = new Environment()
const kernel = new Kernel(environment)

const Address = require('./address.js')
const U256 = require('./u256.js')

const fs = require('fs')

environment.addAccount(new Address('0x1234567890134561111123412341234123412341'), { balance: new U256('100000000000000000') })
//environment.addAccount(new Address('0x4123412341234123411234567890134561111123'), { code: Uint8Array.from(fs.readFileSync('identity.wasm')) })

environment.addAccount(new Address('0xbe862ad9abfe6f22bcb087716c7d89a26051f74c'), { balance: new U256('100000000000000000') })
var tx = new Buffer('f8e380648203e88080b8977f4e616d65526567000000000000000000000000000000000000000000000000003057307f4e616d6552656700000000000000000000000000000000000000000000000000573360455760415160566000396000f20036602259604556330e0f600f5933ff33560f601e5960003356576000335700604158600035560f602b590033560f603659600033565733600035576000353357001ca0b8b9fedc076110cd002224a942e9d7099e4a626ebf66cd9301fc18e2c1181806a04e270be511d42189baf14599eb8d6eb5037ab105032dd3e0fa05b43dad4cb4c2', 'hex')
console.log(kernel.runTx(tx, environment))

// deploy contract
let ret = kernel.runTx({
  nonce: new U256(3),
  from: new Address('0x1234567890134561111123412341234123412341'),
  to: new Address('0x0000000000000000000000000000000000000000'),
  value: new U256('100'),
  gasLimit: new U256('1000000000'),
  gasPrice: new U256(1),
  data: Uint8Array.from(fs.readFileSync('identity.wasm'))
}, environment)
console.log('Account created: ' + ret.accountCreated)

ret = kernel.runTx({
  nonce: new U256(4),
  from: new Address('0x1234567890134561111123412341234123412341'),
  to: ret.accountCreated, //new Address('0x4123412341234123411234567890134561111123'),
  value: new U256('100'),
  gasLimit: new U256('1000000000'),
  gasPrice: new U256(1),
  data: Uint8Array.from(new Buffer('spartaaaa'))
}, environment)

console.log('Return value: ' + ret.returnValue)
