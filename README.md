# SYNOPSIS - WIP
[![Gitter](https://img.shields.io/gitter/room/ethereum/ethereumjs-lib.svg?style=flat-square)](https://gitter.im/ethereum/ethereumjs-lib) or #ethereumjs on freenode  
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
* `git submodule update --init`
* `cd sexpr-wasm-prototype`
* `git checkout origin/binary_0xa`
* `git submodule update --init`
* `make`
* `cd ..`
* `npm test`


# API
todo

# LICENSE
[MPL-2.0](https://tldrlegal.com/license/mozilla-public-license-2.0-(mpl-2))
