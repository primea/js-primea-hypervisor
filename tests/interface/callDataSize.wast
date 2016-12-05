(module
  (memory 1)
  (import $callDataSize  "ethereum" "getCallDataSize"  (result i64))

  (export "main" 0)
  (func 
    (block
      (if (i64.eq (call_import $callDataSize) (i64.const 277))
        (return)
      )
      (unreachable)
    )
  )
)
