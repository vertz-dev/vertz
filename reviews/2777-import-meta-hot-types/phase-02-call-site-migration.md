# Phase 2: Call-Site Migration

- **Author:** claude-opus-4-7 (Vinicius)
- **Reviewer:** claude-opus-4-7 (self-adversarial)
- **Commit:** `c2a81285f`
- **Date:** 2026-04-18

## Changes

- `packages/landing/src/entry-client.ts` + `packages/landing/tsconfig.json`
- `packages/component-docs/src/entry-client.ts` + `tsconfig.json`
- `examples/task-manager/src/entry-client.ts` + `tsconfig.json`
- `examples/linear/src/entry-client.ts` + `tsconfig.json`
- `examples/entity-todo/src/entry-client.ts` + `tsconfig.json`
- `examples/contacts-api/tsconfig.json`

## Verification

### Whitelist-based grep for `import.meta.hot.*` (non-optional)

After the change, only expected occurrences remain:

| File | Reason unchanged |
|------|------------------|
| `poc/ssr-hmr/client.tsx:23` | Inside `if (import.meta.hot)` guard |
| `packages/ui-server/src/build-plugin/fast-refresh-runtime.ts:27` | `if (import.meta.hot) import.meta.hot.accept()` (Bun static analysis) |
| `packages/ui-server/src/build-plugin/plugin.ts:488` | Bun-injected literal in user output |
| `packages/ui-server/src/build-plugin/plugin.ts:13,483` | Comments |
| `packages/ui-server/src/build-plugin/types.ts:15` | Doc comment |
| `native/vtz/src/**` | Rust test fixtures (strings) |

No user-facing code uses `import.meta.hot.` without `?.` or a guard.

### Typecheck delta

Ran `vtzx tsgo --noEmit -p <each-tsconfig>` before and after Phase 2.
`packages/landing` reports 28 errors both before and after — identical set,
all pre-existing (missing `@vertz/theme-shadcn/base` dist, unrelated
Cloudflare Workers types, entity typing gaps). None are
`ImportMeta.hot`-related.

### Lint + format

- `vtzx oxlint <changed-files>` — 0 warnings, 0 errors.
- `vtzx oxfmt <changed-files>` — clean.

## Review Checklist

- [x] Every user-facing `import.meta.hot.*` is either `?.` or guarded.
- [x] All 4 example tsconfigs now include `"vertz/client"` (plus kept `bun-types`).
- [x] `bun-types` retained where present — examples use `Bun.serve`, etc.
- [x] No `.d.ts` files silently redeclare `ImportMeta.hot` with a different shape.
- [x] Phase 1 whitelist claim (no current tsconfig uses `vertz/env`/`vertz/client`) matched reality.

## Findings

### Blockers — none

### Should-Fix — none

### Nits

**N1. Pre-existing typecheck errors remain in `packages/landing`,
`component-docs`, and examples.** None are related to #2777. They predate the
branch and are out of scope. If `turbo run typecheck` fails on main for these
packages, that's a separate issue (likely filtered out of CI — see the
`ci:build-typecheck` filter list in root `package.json`).

### Approved

- Whitelisted framework-internal files correctly left unchanged. Bun's static
  analysis requires the literal `if (import.meta.hot)` form; optional chaining
  would break it.
- `vertz/client` appended after `bun-types` in the types arrays — order
  doesn't matter because both augment `ImportMeta` additively, but `bun-types`
  still provides `ImportMeta.main` and `Bun.serve` etc. as those examples need.

## Resolution

Approved. Proceeding to Phase 3 (mint-docs page + changeset).
