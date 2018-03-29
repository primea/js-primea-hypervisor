const {Message, ModuleRef} = require('primea-objects')
const Hypervisor = require('../')

const level = require('level-browserify')
const RadixTree = require('dfinity-radix-tree')
const db = level('./testdb')

class BaseContainer {
  constructor (actor) {
    this.actor = actor
  }
  onStartup () {}
  static onCreation (code, id) {
    const exp = {}
    Object.getOwnPropertyNames(this.prototype).filter(name => name !== 'constructor').forEach(name => {
      exp[name] = {}
    })
    return new ModuleRef(exp, id)
  }
  onMessage (message) {
    return this[message.funcRef.identifier[1]](...message.funcArguments)
  }
  static get typeId () {
    return 9
  }
}

async function main (numOfActors, depth) {
  // const messageOrder = {}
  let numOfMsg = 0
  class BenchmarkContainer extends BaseContainer {
    main () {
      const refs = [...arguments]
      const ref = refs.pop()
      // const last = messageOrder[this.actor.id.toString('hex')]
      // const message = this.actor.currentMessage
      // messageOrder[this.actor.id.toString('hex')] = message._fromTicks
      numOfMsg++
      this.actor.incrementTicks(10)
      if (ref) {
        this.actor.send(new Message({
          funcRef: ref,
          funcArguments: refs
        }))
      }
    }
  }
  const tree = new RadixTree({
    db: db
  })

  const hypervisor = new Hypervisor(tree)
  hypervisor.registerContainer(BenchmarkContainer)

  const refernces = []
  let _numOfActors = numOfActors
  while (_numOfActors--) {
    const {
      module
    } = hypervisor.createActor(BenchmarkContainer.typeId)
    refernces.push(module.getFuncRef('main'))
  }
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
  hypervisor.send(msgs)
  await hypervisor.scheduler.on('idle', () => {
    const end = new Date() - start
    console.info('Execution time: %dms', end)
    console.log('messages processed', numOfActors * depth + numOfActors)
    console.log('messages processed', numOfMsg)
  })
}

main(1000, 10)
