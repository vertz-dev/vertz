---
'@vertz/server': patch
---

fix(server): AuthInstance.resolveSessionForSSR now assignable to SessionResolver

Updated the return type of `resolveSessionForSSR` on `AuthInstance` to use the
correct `{ id: string; email: string; role: string }` user shape and `AccessSet | null`
for `accessSet`, matching what the implementation already returns. Previously typed
loosely as `Record<string, unknown>` / `unknown`, which caused a type error when
passed to `createBunDevServer`'s `sessionResolver` option.
