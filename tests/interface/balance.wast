;; address of 5d48c1018904a172886829bbbd9c6f4a2d06c47b has a balance of 0x056bc75e2d63100000 (100 ETH)
(module
  (import  "ethereum" "getBalance"  (func $balance (param i32 i32 i32)))
  (memory 1 )
  (data (i32.const 0)  "\5d\48\c1\01\89\04\a1\72\88\68\29\bb\bd\9c\6f\4a\2d\06\c4\7b")
  (export "memory" (memory 0))
  (export "main" (func $main))

  (table
    (export "callback")
    anyfunc
    (elem
      $callback
    )
  )

  (func $main
    (call $balance (i32.const 0) (i32.const 0) (i32.const 0))
  )
 
  (func $callback
    (block
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x0500000000000000))
        (return)
      )
      (unreachable)
    )
  )
)

