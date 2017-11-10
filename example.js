const levelup = require('levelup')
const memdown = require('memdown')
const RadixTree = require('dfinity-radix-tree')
const AbstractContainer = require('primea-abstract-container')
const Message = require('primea-message')
const Hypervisor = require('./')

;(async () => {

  class MyContainer extends AbstractContainer {
    onCreation (message) {
      const address = message.address[0]
      if (port) {
        return this.kernel.addressBook.store('root', address)
      }
    }
    static get typeId () {
      return 9
    }
  }

  const db = new levelup(new memdown())
  const tree = new RadixTree({ db })
  const hypervisor = new Hypervisor(tree)

  // const baseContainer = new MyContainer()
  hypervisor.registerContainer(MyContainer)

  // create two Actors
  const address = hypervisor.creationService.getAddress()
  // const address = hypervisor.creationService.getPort()


  let actorA = await hypervisor.send(address, new Message({
    data: Buffer.from([0x00, MyContainer.typeId,  'hello i am actorA'])
  }))

  let actorB = await hypervisor.send(address, new Message({
    data: Buffer.from([0x00, MyContainer.typeId,  'hello i am actorB'])
  }))

})().then(console.log, console.error)
