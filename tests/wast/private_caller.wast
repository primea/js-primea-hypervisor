(module
  (import "func" "internalize" (func $internalize (param i32 i32)))
  (import "func" "externalize" (func $externalize (param i32) (result i32)))
  (import "test" "check" (func $check (param i32 i32)))
  (memory (export "memory") 1)
  (table (export "table") 1 anyfunc)
  (elem (i32.const 0) $callback)
  (func $call (param i32)
    i32.const 0
    call $externalize
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
  (export "call" (func $call)))
