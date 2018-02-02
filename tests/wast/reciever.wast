(module
  (import "test" "check" (func $check (param i32 i32)))
  (func $receive (param i32)
    get_local 0
    i32.const 5
    call $check
  )
  (export "receive" (func $receive)))
