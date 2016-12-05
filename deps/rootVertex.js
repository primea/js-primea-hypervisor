const KernelVertex = require('./kernelVertex')
const Kernel = require('../')
const Precompiles = require('../precomiles/precompile.js')
const Address = require('./address')

const identityAddress = new Address('0x0000000000000000000000000000000000000004')
const meteringAddress = new Address('0x000000000000000000000000000000000000000A')
const transcompilerAddress = new Address('0x000000000000000000000000000000000000000B')

module.exports = class RootKernelVertex extends KernelVertex {
  constructor (opts) {
    super(opts)
    if (opts.root) {
      this.set(identityAddress.toArray(), new PrecomileVertex(Precompiles.identity))
      this.set(meteringAddress.toArray(), new PrecomileVertex(Precompiles.meteringInjector))
      this.set(transcompilerAddress.toArray(), new PrecomileVertex(Precompiles.transcompiler))
      this.kernel = new Kernel({state: this})
    }
  }
}

class PrecomileVertex extends KernelVertex {
  /**
   * Creates a Vertex for precomiles. This will alwasy return false when hashed
   * so that its contents will never be stored in the merkle trie run serialized
   */
  constructor (precomiled) {
    super()
    this.kernel = precomiled
  }

  hash () {
    return false
  }
}

// detects the correct kernel to load given some code
KernelVertex.codeHandler = (code) => {
  return KernelVertex['default']
}

KernelVertex.codeHandles = {
  'default': Kernel
}

// KernelVertex.linkHander = (link) => {
// }

// KernelVertex.linkHanders = {
// }
