;; address of 5d48c1018904a172886829bbbd9c6f4a2d06c47b has a balance of 100
(module
  (memory 1 (segment 0 "\5d\48\c1\01\89\04\a1\72\88\68\29\bb\bd\9c\6f\4a\2d\06\c4\7b"))
  (import $balance  "ethereum" "balance"  (param i32 i32))
  (export "a" memory)
  (export "test" 0)
  (func 
    (block
      (call_import $balance (i32.const 0) (i32.const 0))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 100))
        (if (i64.eq (i64.load (i32.const 8)) (i64.const 0))
          (return)
        )
      )
      (unreachable)
    )
  )
)

