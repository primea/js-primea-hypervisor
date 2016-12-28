(module
  (import"ethereum" "getCallDataSize" (func  $callDataSize (result i64)))
  (memory 1)
  (export "main" (func $main))
  (func $main
    (block
      (if (i64.eq (call $callDataSize) (i64.const 277))
        (return)
      )
      (unreachable)
    )
  )
)
