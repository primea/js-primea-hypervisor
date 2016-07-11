# JS prototype

The js prototype just implements the Ethereum interface. It uses v8 to run the WASM code.

## Run tests
The tests are written in wasm's text format (.wast) which are then compiled into binary format and ran in v8.

To run the test you need
* download the submodules.
* compile [v8](https://github.com/v8/v8), which will be in the v8 folder, Instuctions [here](https://github.com/v8/v8/wiki/Building-with-Gyp)
* compile the [sexpr-wasm-prototype](https://github.com/WebAssembly/sexpr-wasm-prototype) which will be in the sexpr-wasm-prototype folder
  `cd sexpr-wasm-prototype && make`
* `npm install`
* `npm test`
