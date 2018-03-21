(module
  (import "func" "internalize" (func $internalize (param i32 i32)))
  (import "func" "set_gas_budget" (func $set_gas_budget (param i32 i32)))
  (table (export "table") 1 1 anyfunc)
  (func $receive (param i32)
    get_local 0
    i32.const 10500
    call $set_gas_budget

    get_local 0
    i32.const 0
    call $internalize 
    i32.const 5
    i32.const 0
    call_indirect (param i32)
  )
  (export "receive" (func $receive)))
