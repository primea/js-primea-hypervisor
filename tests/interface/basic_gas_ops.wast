;; starts with 1000 gas
(module
  (import "ethereum" "useGas" (func $useGas (param i64)))
  (import  "ethereum" "getGasLeft" (func $gas (result i64)))

  (export "test" (func $main))
  (func $main
    ;; test adding gas
    (block
      (call $useGas (i64.const 1))
      (if (i64.eq  (call $gas) (i64.const 997))
        (return)
      )
      (unreachable)
    )
    (block
      (call $useGas (i64.const 1))
      (if (i64.eq  (call $gas) (i64.const 996))
        (return)
      )
      (unreachable)
    )
  )
)
