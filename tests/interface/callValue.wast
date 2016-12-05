;; call value of 0x056bc75e2d63100000 (100 ETH)
(module
  (memory 1)
  (import $callValue  "ethereum" "getCallValue"  (param i32))

  (export "a" memory)
  (export "main" 0)
  (func 
    (block
      (call_import $callValue (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x0500000000000000))
        (return)
      )
      (unreachable)
    )
  )
)
