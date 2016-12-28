;; calldata is "596f75206172652077616974...", but i64.load works in LSB mode
(module
  (import "ethereum" "callDataCopy" (func $callDataCopy (param i32 i32 i32)))
  (memory 1)
  (export "memory" (memory 0))
  (export "main" (func $main))
  (func $main
    (block
      (call $callDataCopy (i32.const 0) (i32.const 0) (i32.const 8))
      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x2065726120756f59))
        (return)
      )
      (unreachable)
    )
  )
)
