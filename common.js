const Message = require('./message')

exports.PARENT = Symbol('parent')
exports.ROOT = Symbol('root')
exports.getterMessage = (name, path) => {
  return new Message({
    to: path,
    data: {
      getValue: name
    },
    sync: true
  })
}
