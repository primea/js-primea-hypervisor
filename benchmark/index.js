const AbstractContainer = require('primea-abstract-container')
const Message = require('primea-message')
const Hypervisor = require('../')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

let numOfMsg = 0
const messageOrder = {}

async function main (numOfActors, depth) {
  class BenchmarkContainer extends AbstractContainer {
    onCreation () {}
    async onMessage (message) {
      // console.log('run queue', this.actor.inbox._queue)
      // console.log('from', message._fromId.toString('hex'), 'to: ', this.actor.id.toString('hex'), this.actor.ticks, message._fromTicks)
      const last = messageOrder[this.actor.id.toString('hex')]
      if (last && last > message._fromTicks) {
        console.log(last, message._fromTicks)
        // console.log(this.actor.hypervisor.scheduler.instances)
      } else {
      }
      messageOrder[this.actor.id.toString('hex')] = message._fromTicks
      numOfMsg++
      this.actor.incrementTicks(1)
      const cap = message.caps.pop()
      if (cap) {
        return this.actor.send(cap, message)
      }
    }
    static get typeId () {
      return 9
    }
  }

  const tree = new RadixTree({
    db: db
  })

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(BenchmarkContainer)

  const caps = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const cap = await hypervisor.createActor(BenchmarkContainer.typeId, new Message())
    caps.push(cap)
  }
  _numOfActors = numOfActors
  let msgs = []
  while (_numOfActors--) {
    const message = new Message()
    msgs.push(message)
    let _depth = depth
    while (_depth--) {
      const r = Math.floor(Math.random() * numOfActors)
      const cap = caps[r]
      message.caps.push(cap)
    }
  }

  let start = new Date()
  // hypervisor.scheduler.lock(Buffer.from([0xff]))
  msgs.forEach((msg, index) => {
    hypervisor.send(caps[index], msg)
  })
  console.log('done sending')
  await hypervisor.scheduler.wait(Infinity)
  // console.log(JSON.stringify(hypervisor.tree.root, null ,2))
  const end = new Date() - start
  console.info('Execution time: %dms', end)
  console.log('messages processed', numOfActors * depth + numOfActors)
  console.log('messages processed', numOfMsg)
}

main(55, 10)
