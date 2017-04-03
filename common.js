const Message = require('primea-message')

exports.PARENT = '..'
exports.ROOT = '/'
exports.getterMessage = (name, path) => {
  const message = new Message({
    data: {
      getValue: name
    },
    sync: true
  })
  if (path) {
    message.to = path
  }
  return message
}
