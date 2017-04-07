exports.run = async (message, kernel) => {
  const to = message.payload.to
  const next = to.split('/')[message.hops - 1]
  if (next !== undefined) {
    return kernel.send(next, message)
  } else if (message.payload.getValue) {
    return (await kernel.state.get(message.data.getValue)).value
  }
}
