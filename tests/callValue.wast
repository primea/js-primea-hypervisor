;; call value of 100
(module
  (memory 1)
  (import $callValue  "ethereum" "callValue"  (param i32))

  (export "a" memory)
  (export "test" 0)
  (func 
    (block
      (call_import $callValue (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 100))
        (if (i64.eq (i64.load (i32.const 8)) (i64.const 0))
          (return)
        )
      )
      (unreachable)
    )
  )
)
