---
'@vertz/server': patch
---

fix(server): narrow `rules.entitlement()` to the registered `Entitlement` union

Closes [#2992](https://github.com/vertz-dev/vertz/issues/2992).

`rules.entitlement()` accepted any `string`, so typos like `rules.entitlement('task:udpate')` compiled cleanly and only surfaced at runtime. The parameter now uses the `Entitlement` type which narrows to the declared entitlement union when `@vertz/codegen` has run (via the existing `EntitlementRegistry` augmentation in `access.d.ts`) and falls back to `string` otherwise — so autocomplete and typo detection work end-to-end without requiring any user-side configuration beyond running codegen.
