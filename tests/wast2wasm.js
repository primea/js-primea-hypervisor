const wabt = require('wabt')
const fs = require('fs')
const types = require('../customTypes')

function filesWast2wasm () {
  const srcFiles = fs.readdirSync(`${__dirname}/wast`)
  const wastFiles = srcFiles.filter(name => name.split('.').pop() === 'wast')
  for (let file of wastFiles) {
    const wat = fs.readFileSync(`${__dirname}/wast/${file}`).toString()
    file = file.split('.')[0]
    let json
    try {
      json = fs.readFileSync(`${__dirname}/wast/${file}.json`)
      json = JSON.parse(json)
    } catch (e) {
      console.log('no json')
    }

    console.log(wat)
    const mod = wabt.parseWat('module.wast', wat)
    let binary = Buffer.from(mod.toBinary({log: true}).buffer)
    if (json) {
      console.log(json)
      const buf = types.encodeJSON(json)
      binary = types.injectCustomSection(buf, binary)
    }
    fs.writeFileSync(`${__dirname}/wasm/${file}.wasm`, binary)
  }
}

filesWast2wasm()
