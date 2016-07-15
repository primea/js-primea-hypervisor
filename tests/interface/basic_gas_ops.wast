;; starts with 1000 gas
(module
  (import $addGas  "ethereum" "addGas" (param i32))
  (import $gasUsed "ethereum" "gasUsed" (result i64))
  (import $gasLeft "ethereum" "gasLeft" (result i64))

  (export "test" 0)
  (func 
    ;; test adding gas
    (block
      (call_import $addGas (i32.const 1))
      (if (i64.eq  (call_import $gasUsed) (i64.const 1))
        (return)
      )
      (unreachable)
    )
    (block
      (call_import $addGas (i32.const 1))
      (if (i64.eq  (call_import $gasUsed) (i64.const 2))
        (return)
      )
      (unreachable)
    )
    ;; should disregard negative values
    (block
      (call_import $addGas (i32.const -1))
      (if (i64.eq  (call_import $gasUsed) (i64.const 2))
        (return)
      )
      (unreachable)
    )
    ;; gas left
    (block
      (if (i64.eq  (call_import $gasLeft) (i64.const 998))
        (return)
      )
      (unreachable)
    )
  )
)
