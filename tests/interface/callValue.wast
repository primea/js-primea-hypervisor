;; call value of 0x056bc75e2d63100000 (100 ETH)
(module
  (import  "ethereum" "getCallValue" (func  $callValue (param i32)))
  (memory 1)
  (export "memory" (memory 0))
  (export "main" (func $main))
  (func $main 
    (block
      (call $callValue (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x0500000000000000))
        (return)
      )
      (unreachable)
    )
  )
)
