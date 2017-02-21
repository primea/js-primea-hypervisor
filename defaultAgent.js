exports.run = async (message, kernel) => {
  const to = message.to[message.hops - 1]
  if (to) {
    return kernel.send(message)
  } else if (message.data.getValue) {
    return (await kernel.state.get(message.data.getValue)).value
  }
}
