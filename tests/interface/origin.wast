;; starts with an origin of 5d48c1018904a172886829bbbd9c6f4a2d06c47b
(module
  (memory 1)
  (import $origin  "ethereum" "origin"  (param i32))

  (export "test" 0)
  (export "a" memory)
  (func 
    (block
      ;; loads the address into memory
      (call_import $origin (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x72a1048901c1485d))
        (return)
      )
      (unreachable)
    )
  )
)
