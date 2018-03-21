(module
  (import "table" "externalize" (func $externalize (param i32 i32) (result i32)))
  (import "memory" "externalize" (func $mem_externalize (param i32 i32) (result i32)))
  (import "table" "internalize" (func $internalize (param i32 i32 i32 i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "test")
  (func $test
    (i32.const 0)
    (call $mem_externalize (i32.const 0)  (i32.const 4))
    (i32.const 4)
    (call $mem_externalize (i32.const 0)  (i32.const 4))
    (i32.store)
    (i32.store)


    i32.const 0
    i32.const 2
    call $externalize

    i32.const 0
    i32.const 8
    i32.const 2
    call $internalize
  )
  (export "test" (func $test)))
