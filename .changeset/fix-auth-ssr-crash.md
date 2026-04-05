---
'@vertz/ui': patch
---

fix(ui): AuthProvider no longer crashes during SSR when auth SDK is partial/undefined

Guards `auth.signIn.url` and `auth.signUp.url` property access with optional chaining so AuthProvider construction succeeds in the Rust V8 isolate where the auth SDK may not be fully available. Also adds runtime guards in signIn/signUp async bodies to return error Results instead of crashing when SDK methods are undefined.
