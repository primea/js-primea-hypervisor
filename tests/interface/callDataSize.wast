(module
  (import"ethereum" "getCallDataSize" (func $callDataSize (result i32)))
  (memory 1)
  (export "main" (func $main))
  (func $main
    (block
      (if (i32.eq (call $callDataSize) (i32.const 277))
        (return)
      )
      (unreachable)
    )
  )
)
