;; address of 5d48c1018904a172886829bbbd9c6f4a2d06c47b has a balance of 100
(module
  (memory 1 (segment 0 "\7b\c4\06\2d\4a\6f\9c\bd\bb\29\68\88\72\a1\04\89\01\c1\48\5d"))
  (import $balance  "ethereum" "getBalance"  (param i32 i32))
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

