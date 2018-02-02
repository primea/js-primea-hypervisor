(module
  (import "func" "internalize" (func $internalize (param i32 i32) (result i32)))
  (table (export "table") 1 1 anyfunc)
  (func $call (param i32)
    i32.const 5
    get_local 0
    i32.const 0
    call $internalize 
    call_indirect (param i32)
  )
  (export "call" (func $call)))
