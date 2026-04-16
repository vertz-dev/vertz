---
'@vertz/runtime': patch
---

fix(vtz): floor float delay before BigInt conversion in setTimeout/setInterval

`BigInt()` throws `RangeError` on floating-point numbers. Timer delays like `1.5` or `Math.random() * 10` now work correctly by flooring the value before conversion.
