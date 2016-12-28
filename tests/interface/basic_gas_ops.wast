;; starts with 1000 gas
(module
  (import "ethereum" "useGas" (func $useGas (param i32)))
  (import  "ethereum" "getGasLeft" (func $gas(result i32)))

  (export "test" (func $main))
  (func $main
    ;; test adding gas
    (block
      (call $useGas (i32.const 1))
      (if (i32.eq  (call $gas) (i32.const 997))
        (return)
      )
      (unreachable)
    )
    (block
      (call $useGas (i32.const 1))
      (if (i32.eq  (call $gas) (i32.const 996))
        (return)
      )
      (unreachable)
    )
  )
)
