const U256 = require('./u256.js')
const Address = require('./address.js')
const Block = require('./block.js')
const fakeBlockChain = require('./fakeBlockChain.js')

module.exports = class Environment {
  constructor (data) {
    const defaults = {
      block: new Block(),
      blockchain: fakeBlockChain,
      // gas tank
      gasPrice: 0,
      gasLeft: 1000000,
      gasRefund: 0,
      // call infromation
      address: new Address('0x0000000000000000000000000000000000000000'),
      origin: new Address('0x0000000000000000000000000000000000000000'),
      caller: new Address('0x0000000000000000000000000000000000000000'),
      callValue: new U256(0),
      callData: new Uint8Array(),
      // the ROM
      code: new Uint8Array(), // the current running code
      // output calls
      logs: [],
      selfDestructAddress: new Address('0x0000000000000000000000000000000000000000'),
      // more output calls
      returnValue: new Uint8Array()
    }

    this.state = new Map()

    Object.assign(this, defaults, data || {})
  }

  addAccount (address, trie) {
    let account = new Map()
    account.set('nonce', trie.nonce || new U256(0))
    account.set('balance', trie.balance || new U256(0))
    account.set('code', trie.code || new Uint8Array())
    account.set('storage', trie.storage || new Map())
    this.state.set(address.toString(), account)
  }

  getBalance (address) {
    const account = this.state.get(address.toString())
    if (account) {
      return account['balance']
    } else {
      return new U256()
    }
  }

  getCode (address) {
    const account = this.state.get(address.toString())
    if (account) {
      return account['code']
    } else {
      return Uint8Array.from(new Buffer([]))
    }
  }

  getBlockHash (height) {
    return this.blockchain.getBlock(height).hash()
  }

  // kernal
  create (code, value) {
    // STUB
  }

  call (gas, address, value, data) {
    // STUB
    return // result
  }

  callCode (gas, address, value, data) {
    // STUB
    return // result
  }

  delegateCall (gas, address, data) {
    // STUB
    return // result
  }
}
