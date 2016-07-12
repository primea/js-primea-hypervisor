# Architechture

This prototype attemps to module Ethereum as three seperate but interlocking 
layers. Environment, Kernel, and VM

 +------------------+
 |                  |
 | Environment      |
 |                  |
 +------------------+
        |
 +------------------+
 |                  |
 | Kernal           |
 |                  |
 +------------------+
        |
   interfaces
        |
 +------------------+
 |                  |
 | VM               |
 |                  |
 +------------------+

## VM

The Vm implements [webassembly](https://github.com/WebAssembly/design). Two
sets of intefaces are exposed to it by the kernal. The Kernal Interface and 
The Environment Interface.

## Kernel Interface

The kernal handles the following
 * Interprocess communication
 * Intializing the VM and exposes ROM to it (codeHandler)
 * Exposing the namespace and Intializes the Environment which VM instance exists 
 (callHandler)
 * Provides some built in contracts that facilitates different run levels 
 (runTx, runBlock)
 * Provides resource sharing and limiting via gas

The kernel Interface expose kernal primitives to VM which contain
 * IPC (calls)
 * Namespace Interface
  * GET/PUT/DELETE/ROOT/NEXT - currently implemented as a [digraph](https://github.com/wanderer/generic-digraph/blob/master/docs/index.md)

## Environment Interface

The Environment Interface expose the following
* blockchain infromation
* current block infromation
* transaction infromation
