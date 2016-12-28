;; starts with an address of 5d48c1018904a172886829bbbd9c6f4a2d06c47b
(module
  (import "ethereum" "call" (func $call (param i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (memory 1)                        
  (export "a" (memory 0))
  (export "main" (func $main))
  (func $main
    (block
      ;; Memory layout:
      ;;   0 -  20 bytes: address (4)
      ;;  20 -  52 bytes: value (0)
      ;;  52 -  56 bytes: data (0x42004200)
      ;;  56 -  60 bytes: result
      (i32.store (i32.const 0) (i32.const 0x4))
      (i32.store (i32.const 52) (i32.const 0x42004200))
      (call $call (i32.const 2000) (i32.const 0) (i32.const 20) (i32.const 52) (i32.const 4) (i32.const 56) (i32.const 4) (i32.const 1))
      drop
    )
  )

  (export "1" (func $callback))
  (func $callback (param $result i32)
    (if (i32.eq (i32.const 1) (get_local $result))
      (return)
    )
    (unreachable)
  ) 
)
