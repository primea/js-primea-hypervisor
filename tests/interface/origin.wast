;; starts with an origin of 5d48c1018904a172886829bbbd9c6f4a2d06c47b
(module
  (import "ethereum" "getTxOrigin"  (func $origin (param i32)))
  (memory 1)

  (export "main" (func $main))
  (export "memory" (memory 0))
  (func $main 
    (block
      ;; loads the address into memory
      (call $origin (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x72a1048901c1485d))
        (return)
      )
      (unreachable)
    )
  )
)
