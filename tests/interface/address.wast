;; starts with an address of 5d48c1018904a172886829bbbd9c6f4a2d06c47b
(module
  (import "ethereum" "getAddress"  (func $address (param i32)))
  
  (memory 1)
  (export "main" (func 0))
  (export "memory" (memory 0))
  (func 
    (block
      ;; loads the address into memory
      (call $address (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x72a1048901c1485d))
        (return)
      )
      (unreachable)
    )
  )
)
