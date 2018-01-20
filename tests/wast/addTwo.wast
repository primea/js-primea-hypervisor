(module
  (func $addTwo (param i32 i32)
    get_local 0
    get_local 1
    i32.add
    drop  
  )
  (export "addTwo" (func $addTwo)))
