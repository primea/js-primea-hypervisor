const customTypes = require('../customTypes.js')
const WasmContainer = require('../wasmContainer.js')
const fs = require('fs')

async function main () {
  let callerJSON = JSON.parse(fs.readFileSync('./wast/caller.json'))
  let callerWasm = fs.readFileSync('./wasm/caller.wasm')
  callerWasm = customTypes.inject(callerWasm, callerJSON)

  let recieverJSON = JSON.parse(fs.readFileSync('./wast/reciever.json'))
  let recieverWasm = fs.readFileSync('./wasm/reciever.wasm')
  recieverWasm = customTypes.inject(recieverWasm, recieverJSON)

  const callerContainer = new WasmContainer()
  callerContainer.onCreation(callerWasm)
  callerJSON = callerContainer.json

  const recieverContainer = new WasmContainer()
  recieverContainer.onCreation(recieverWasm)
  recieverJSON = recieverContainer.json

  const callFuncRef = callerContainer.getFuncRef('call')

  const funcRef = recieverContainer.getFuncRef('receive')
  callFuncRef.args.push({
    type: 'funcRef',
    arg: funcRef
  })

  callerContainer.onMessage(callFuncRef)
}

main()
