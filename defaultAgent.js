exports.run = async (message, kernel) => {
  const to = message.nextPort()
  if (to) {
    return kernel.send(to, message)
  } else if (message.data.getValue) {
    return (await kernel.state.get(message.data.getValue)).value
  }
}
