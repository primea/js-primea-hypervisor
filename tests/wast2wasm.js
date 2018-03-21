const wabt = require('wabt')
const fs = require('fs')
const annotations = require('primea-annotations')

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
      console.log(`no json for ${file}`)
    }

    try {
      const mod = wabt.parseWat('module.wast', wat)
      const r = mod.toBinary({log: true})
      let binary = Buffer.from(r.buffer)
      if (json) {
        console.log(json)
        binary = annotations.encodeAndInject(json, binary)
      }
      fs.writeFileSync(`${__dirname}/wasm/${file}.wasm`, binary)
    } catch (e) {
      console.log(`failed at ${file}`)
      console.log(e)
    }
  }
}

filesWast2wasm()
