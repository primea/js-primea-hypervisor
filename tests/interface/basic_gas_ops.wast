;; starts with 1000 gas
(module
  (import $useGas  "ethereum" "useGas" (param i32))
  (import $gas "ethereum" "getGasLeft" (result i32))

  (export "test" 0)
  (func 
    ;; test adding gas
    (block
      (call_import $useGas (i32.const 1))
      (if (i32.eq  (call_import $gas) (i32.const 997))
        (return)
      )
      (unreachable)
    )
    (block
      (call_import $useGas (i32.const 1))
      (if (i32.eq  (call_import $gas) (i32.const 996))
        (return)
      )
      (unreachable)
    )
  )
)
