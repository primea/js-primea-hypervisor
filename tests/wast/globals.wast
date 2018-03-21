(module
  (import "memory" "externalize" (func $externalize (param i32 i32) (result i32)))
  (import "memory" "internalize" (func $internalize (param i32 i32 i32 i32)))
  (global (mut i32) (i32.const -2))
  (global (mut i32) (i32.const -2))
  (memory (export "memory") 1)
  (data (i32.const 0) "test")
  (func $store
    i32.const 0
    i32.const 4
    call $externalize
    set_global 0
  )

  (func $load
    get_global 0
    i32.const 0 
    i32.const 5
    i32.const 4
    call $internalize
  )
  (export "load" (func $load))
  (export "store" (func $store)))
