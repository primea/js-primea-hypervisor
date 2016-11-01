const Kernel = require('./index.js')
const KernelInterface = require('./kernelInterface.js')
const Environment = require('./environment.js')

module.exports = class DebugKernel extends Kernel {
  codeHandler (code, environment = new Environment({state: this.state})) {
    const kernelInterface = new KernelInterface(this, environment)
    const promise = kernelInterface.run(code)
    // expose the memory for debugging
    this.memory = kernelInterface.memory
    this.instance = kernelInterface._instance
    this.onDone = kernelInterface.onDone.bind(kernelInterface)
    return promise
  }
}
