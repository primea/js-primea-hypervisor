exports.run = async (message, kernel) => {
  const to = message.nextPort()
  if (to !== undefined) {
    await kernel.send(message)
    return
  } else if (message.data.getValue) {
    return (await kernel.state.get(message.data.getValue)).value
  }
}
