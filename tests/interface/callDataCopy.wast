;; calldata is "596f75206172652077616974...", but i64.load works in LSB mode
(module
  (memory 1)
  (import $callDataCopy "ethereum" "callDataCopy" (param i32 i32 i32))

  (export "memory" memory)
  (export "test" 0)
  (func 
    (block
      (call_import $callDataCopy (i32.const 0) (i32.const 0) (i32.const 8))

      (if (i64.eq (i64.load (i32.const 0)) (i64.const 0x596f752061726520))
        (return)
      )
      (unreachable)
    )
  )
)
