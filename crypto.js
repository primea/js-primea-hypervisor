const WebCrypto = require('node-webcrypto-ossl')
module.exports = new WebCrypto({
  directory: `${__dirname}/.webcrypto`
})
