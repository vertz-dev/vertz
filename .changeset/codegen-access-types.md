---
'@vertz/compiler': patch
'@vertz/codegen': patch
'@vertz/server': patch
'@vertz/ui': patch
---

Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.
