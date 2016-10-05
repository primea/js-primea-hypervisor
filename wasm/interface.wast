(module
  ;; useGas
  (import $useGas "interface" "useGas" (param i32 i32))
  (func $useGasShim
    (param $amount i64)
    (call_import $useGas
                 (i32.wrap/i64 
                   (i64.shr_u (get_local $amount) (i64.const 32))) 
                 (i32.wrap/i64 (get_local $amount)))
  )  
  (export "useGas" $useGasShim)

  ;;  getGasLeft
  (import $getGasLeftHigh "interface" "getGasLeftHigh" (result i32))
  (import $getGasLeftLow "interface" "getGasLeftLow" (result i32))
  (func $getGasLeft
    (result i64)
    (call_import $useGas (i32.const 0) (i32.const 2))
    (return 
      (i64.add
        (i64.shl (i64.extend_u/i32 (call_import $getGasLeftHigh)) (i64.const 32)) 
        (i64.extend_u/i32 (call_import $getGasLeftLow))))
  )
  (export "getGasLeft" $getGasLeft)

  ;; call
  ;; (import $call "ethereum" "call" (param i32 i32 i32 i32 i32 i32 i32 i32) (result i32))
  (import $call "interface" "call" (param i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32))
  (func $callShim
    (param i64 i32 i32 i32 i32 i32 i32 i32)
    (result i32)
    (call_import $call
           (i32.wrap/i64 
             (i64.shr_u (get_local 0) (i64.const 32))) 
           (i32.wrap/i64 (get_local 0))
           (get_local 1)
           (get_local 2)
           (get_local 3)
           (get_local 4)
           (get_local 5)
           (get_local 6)
           (get_local 7)
    )
  )
  (export "call" $callShim)
)
