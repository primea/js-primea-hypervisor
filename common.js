const Message = require('./message')

exports.PARENT = Symbol('parent')
exports.ROOT = Symbol('root')
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
