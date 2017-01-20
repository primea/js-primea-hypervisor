exports.run = async (message, kernel) => {
  const to = message.nextPort()
  if (message.toPort) {
    return kernel.send(to, message)
  } else if (message.data.getValue) {
    return (await kernel.state.get(message.data.getValue)).value
  }
}
