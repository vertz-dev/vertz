---
'@vertz/compiler': patch
'@vertz/codegen': patch
---

Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error.
