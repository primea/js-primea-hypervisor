const Message = require('../message.js')
const Hypervisor = require('../')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

let numOfMsg = 0
const messageOrder = {}

class BenchmarkContainer {
  static validate () {}
  static compile () {}
  static get typeId () {
    return 9
  }

  static exports (m, id) {
    return Object.keys(this.functions()).map(name => {
      return {
        name,
        destId: id
      }
    })
  }
  static instance (actor) {
    return {
      exports: this.functions(actor)
    }
  }
  static functions (actor) {
    return {
      onMessage: function () {
        const refs = [...arguments]
        const ref = refs.pop()
        // console.log('run queue', this.actor.inbox._queue)
        // console.log('from', message._fromId.toString('hex'), 'to: ', this.actor.id.toString('hex'), this.actor.ticks, message._fromTicks)
        // const last = messageOrder[actor.id.toString('hex')]
        // const message = actor.currentMessage 
        // if (last && last > message._fromTicks) {
        //   console.log(last, message._fromTicks)
        //   // console.log(this.actor.hypervisor.scheduler.instances)
        // }
        // messageOrder[actor.id.toString('hex')] = message._fromTicks
        numOfMsg++
        actor.incrementTicks(10)
        if (ref) {
          return actor.send(new Message({
            funcRef: ref,
            funcArguments: refs
          }))
        }
      }
    }
  }
}

async function main (numOfActors, depth) {
  const tree = new RadixTree({
    db: db
  })

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(BenchmarkContainer)

  const refernces = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const {exports} = await hypervisor.createActor(BenchmarkContainer.typeId)
    refernces.push(exports[0])
  }
  // console.log(refernces)
  _numOfActors = numOfActors
  let msgs = []
  while (_numOfActors--) {
    let _depth = depth
    const funcArguments = []
    while (_depth--) {
      const r = Math.floor(Math.random() * numOfActors)
      const ref = refernces[r]
      funcArguments.push(ref)
    }
    const message = new Message({
      funcArguments,
      funcRef: refernces[_numOfActors]
    })
    msgs.push(message)
  }

  let start = new Date()
  await Promise.all(msgs.map((msg) => hypervisor.send(msg)))
  console.log('done sending')
  hypervisor.scheduler.on('idle', () => {
    const end = new Date() - start
    console.info('Execution time: %dms', end)
    console.log('messages processed', numOfActors * depth + numOfActors)
    console.log('messages processed', numOfMsg)
  })
}

main(1000, 10)
