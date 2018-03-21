(module
  (import "memory" "externalize" (func $externalize (param i32 i32) (result i32)))
  (import "memory" "internalize" (func $internalize (param i32 i32 i32 i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "test")
  (func $test
    i32.const 0
    i32.const 4
    call $externalize
    i32.const 0 
    i32.const 5
    i32.const 4
    call $internalize
  )
  (export "test" (func $test)))
