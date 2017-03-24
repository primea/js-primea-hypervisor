const Message = require('./message')

exports.PARENT = 0
exports.ROOT = 1
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
