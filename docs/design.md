# Architecture

```
                     +--------------+
                     |              |
                     | Environment  |
                     |              |
                     +--------------+        +--------------------+
                             |               |                    +--+
                             |          +----+   Imports          |  |
                             |          |    +--------------------+  |
 +------------+       +------------+    |                            |   +--------------------------+
 |            |       |            |    |    +--------------------+  |   |                          |
 |   Kernel   +-------+VM Container+---------+                    +------+  Sandboxed VM instance   |
 |            |       |            |    |    |   Imports          |  |   |                          |
 +------------+       +------------+    |    +--------------------+  |   +--------------------------+
                                        |                            |
                                        |    +--------------------+  |
                                        |    |                    |  |
                                        +----+   Imports          +--+
                                             +--------------------+

```
# Overview
The `Kernel` is modeled to be somewhat like [actors](https://en.wikipedia.org/wiki/Actor_model). Each Kernel/Actor is bound to a segment of code and a state tree on startup. The Kernel provides the top level API. When the kernel recieves a message from another kernel or an external source (signal) it may run that code in a VM container. The container just provides a uniform way to interact with VMs. The container is given an instance of `Evironment`. The `Evironment` contains all the ephemeral state that need for the VM container and instance. Lastly the VM container start and manages the VM instance which is assumed to be sandboxed. The Sandbox communicates to VM container via `Imports` that are exposed to it on the time of creation. 
