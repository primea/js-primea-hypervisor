(module
  (import $useGas "interface" "useGas" (param i32  i32))
  (func $useGasShim
    (param $amount i64)
    (call_import $useGas
                 (i32.wrap/i64 
                   (i64.shr_u (get_local $amount) (i64.const 32))) 
                 (i32.wrap/i64 (get_local $amount)))
  )  
  (export "useGas" $useGasShim)
)
