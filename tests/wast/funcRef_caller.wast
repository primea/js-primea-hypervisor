(module
  (import "func" "internalize" (func $internalize (param i32 i32)))
  (import "test" "check" (func $check (param i32 i32)))
  (import "module" "self" (func $self (result i32)))
  (import "module" "exports" (func $exports (param i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "callback")
  (table (export "table") 1 1 anyfunc)
  (func $call (param i32)
    call $self
    i32.const 0
    i32.const 8
    call $exports

    i32.const 0
    get_local 0
    call $internalize 
    i32.const 0
    call_indirect (param i32)
  )
  (func $callback (param i32)
    get_local 0
    i32.const 5
    call $check
  )
  (export "call" (func $call))
  (export "callback" (func $callback)))
