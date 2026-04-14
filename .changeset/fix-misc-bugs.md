---
'@vertz/runtime': patch
---

fix(vtz): strip `export type *` in SSR, persist lockfile platform constraints

- Strip `export type * from` and `export type * as Ns from` in the TypeScript strip pass, fixing SSR crashes on type-only star re-exports (#2638)
- Persist `os` and `cpu` platform constraints in lockfile entries so they round-trip correctly through write/parse (#2645)
- Replace no-op pre-push hook with working `vtz ci` quality gates (#2643)
