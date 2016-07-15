;; starts with an caller of 5d48c1018904a172886829bbbd9c6f4a2d06c47b
(module
  (memory 1)
  (import $sstore  "ethereum" "sstore" (param i32 i32))
  (import $sload    "ethereum" "sload"   (param i32 i32))

  (export "test" 0)
  (export "a" memory)
  (func 
    (local $temp i64)
    (block
      ;; should roundtrip store and load a value from storage
      (i64.store (i32.const 0) (i64.const 173553719826446289))
      (call_import $sstore (i32.const 64) (i32.const 0))
      (call_import $sload (i32.const 64) (i32.const 64))
      (set_local $temp 
        (i64.load (i32.const 64)))

      (if (i64.eq (i64.load (i32.const 0)) (i64.const 173553719826446289))
        (return))
      (unreachable)
    )
  )
)
