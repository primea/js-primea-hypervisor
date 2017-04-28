# SYNOPSIS - WIP
[![NPM Package](https://img.shields.io/npm/v/merkle-trie.svg?style=flat-square)](https://www.npmjs.org/package/ewasm-kernel)
[![Build Status](https://img.shields.io/travis/ewasm/ewasm-kernel.svg?branch=master&style=flat-square)](https://travis-ci.org/ewasm/ewasm-kernel)
  
[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)  

This is a JS prototype of the [eWASM kernal](https://github.com/ethereum/evm2.0-design).


# INSTALL
You need to compile [nodejs](https://github.com/nodejs/node) from master (`9983af03470a89cc925781279be40898efae3f31` is known to be working) to run
~~`npm install ewasm-kernel`~~

clone and run `npm install`

# CLONE
* [mango](https://github.com/axic/mango) `git clone mango://0xf75056c8c84d993434a2f19251df9ea2a8708df0`
* [git-ssb](https://github.com/clehner/git-ssb) `git clone ssb://%ffhV6DU5qTXl7+fER4qztY37+/C2/6dsFALkREjb2MU=.sha256`
* git `git clone https://github.com/ethereumjs/ewasm-kernel.git` 



# TESTS 
The tests are written in wasm's text format (.wast) which are then compiled into binary format and ran in node.

To run the test you need
* `git submodule update --init --recursive`
* `cd tools/sexpr-wasm-prototype`
* `git checkout origin/binary_0xa`
* `make`
* `cd ../..`
* `npm test`


# API
todo

# LICENSE
[MPL-2.0](https://tldrlegal.com/license/mozilla-public-license-2.0-(mpl-2))


The Kernel enforces IPC and starts the VM
The hypervisor start and stops kernels
the VM acts as a sandbox for some given code and expose and interface to the kernel
