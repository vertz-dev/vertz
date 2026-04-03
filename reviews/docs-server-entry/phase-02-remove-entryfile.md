# Phase 2: Remove compiler.entryFile

- **Author:** main-agent
- **Reviewer:** review-agent
- **Commits:** 9331b13a1..5f3b809ed
- **Date:** 2026-04-03

## Changes

- `packages/compiler/src/config.ts` (modified) — Removed `entryFile` from `CompilerConfig` and `resolveConfig()`
- `packages/compiler/src/incremental.ts` (modified) — Replaced `CategorizeOptions.entryFile` with `ENTRY_FILE_NAMES` set; removed `CategorizeOptions` interface
- `packages/compiler/src/index.ts` (modified) — Removed `CategorizeOptions` export
- `packages/cli/src/config/loader.ts` (modified) — Removed entryFile from defaults
- `packages/cli/src/config/defaults.ts` (modified) — Removed entryFile from CLI defaults
- `packages/cli/src/pipeline/orchestrator.ts` (modified) — Removed entryFile from createCompiler call
- `packages/cli/src/production-build/orchestrator.ts` (modified) — Removed entryFile from createCompiler call
- `packages/cli/src/production-build/cloudflare/build-cloudflare.ts` (modified) — Removed entryFile logic
- `examples/contacts-api/vertz.config.ts` (modified) — Simplified to empty default export
- `examples/entity-todo/vertz.config.ts` (modified) — Simplified to empty default export
- `examples/linear/vertz.config.ts` (modified) — Simplified to empty default export
- `packages/create-vertz-app/src/templates/index.ts` (modified) — Template no longer emits entryFile
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts` (modified) — Tests assert no entryFile
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` (modified) — Tests assert no entryFile
- `packages/compiler/src/__tests__/incremental.test.ts` (modified) — Added tests for convention-based detection
- `packages/mint-docs/guides/server/codegen.mdx` (modified) — Removed entryFile from config example
- `packages/mint-docs/project-structure.mdx` (modified) — Updated to reflect no entry file config
- 7 test files updated to remove entryFile from config objects

## CI Status

- [ ] Quality gates passed at `5f3b809ed`

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] No type gaps or missing edge cases — **findings below**
- [x] No security issues
- [x] Public API changes match design

## Findings

### Changes Requested

#### BLOCKER-1: `packages/cli/README.md` still references `entryFile`

The CLI README at `packages/cli/README.md` lines 165 and 189 still document `entryFile`:

```
Line 165:    entryFile: 'src/app.ts',
Line 189: | `compiler.entryFile` | `string`  | `'src/app.ts'`       | Entry file               |
```

This is a public-facing document. It tells developers to use a config option that no longer exists in the type system. Must be updated to match the removal.

#### BLOCKER-2: `packages/site/pages/guides/server/codegen.mdx` still references `entryFile`

The old docs site at `packages/site/pages/guides/server/codegen.mdx` line 27 still shows:

```ts
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};
```

While `packages/mint-docs` was properly updated, the ported `packages/site` copy was not. Both sites must be consistent.

#### SHOULD-FIX-1: `/api/` substring guard is too broad

The `categorize()` function uses `!path.includes('/api/')` to exclude nested `server.ts` files (line 46 of `incremental.ts`):

```ts
if (ENTRY_FILE_NAMES.has(file) && !path.includes('/api/')) return 'app-entry';
```

This is a substring match, not a directory-level check. It will incorrectly exclude paths like:
- `src/my-api-service/server.ts` (contains `/api-` which does NOT match, but `/api/` would)
- `src/internal/api/server.ts` (matches `/api/`, excluded even though not the conventional `src/api/` path)
- `packages/api/server.ts` (matches `/api/`)

The intent is to exclude the specific TS CLI fallback path `src/api/server.ts`. A more precise guard would check `dirname(path)` ends with `/api` or check for a specific prefix. However, this is a pre-existing pattern (the old code also had ambiguity around which paths match), and the practical impact is low since the project convention is `src/server.ts`. Recommend at minimum a comment explaining the intent.

#### SHOULD-FIX-2: No test coverage for `.tsx` entry variants

`ENTRY_FILE_NAMES` includes `server.tsx` and `app.tsx`, but the tests only verify `src/app.ts` and `src/server.ts`. Missing tests:

- `src/app.tsx` should trigger `requiresFullRecompile`
- `src/server.tsx` should trigger `requiresFullRecompile`

If `.tsx` support is a deliberate part of the convention, it should be tested. If a future change accidentally removes `.tsx` from the set, no test would catch it.

#### SHOULD-FIX-3: No deprecation warning for existing `entryFile` configs

When a user upgrades and their `vertz.config.ts` still has `compiler.entryFile`, the property is silently dropped by `resolveConfig()` (it only picks known fields). For JS users or configs loaded via `jiti`, there is no type error and no console warning. The property is silently ignored.

This is a soft breaking change. Pre-v1 policy allows breaking changes, but a single `console.warn` in `resolveConfig()` checking for unknown keys (or specifically for `entryFile`) would prevent developer confusion. Without it, someone whose codegen previously worked because of a custom `entryFile` path will now get different behavior with no indication of why.

#### NIT-1: `CategorizeOptions` removal from index.ts is clean

The `CategorizeOptions` type export was removed from `packages/compiler/src/index.ts`. Grep confirms no other consumers reference it. Clean removal.

#### NIT-2: Design doc comparison table is now outdated

The design doc at `plans/2230-docs-server-entry-convention.md` (lines 28-33) has a comparison table that references `compiler.entryFile` as if it still exists. This is a plan document (not shipped), so it's not user-facing, but it's now factually inaccurate. Low priority.

## Resolution

(Author to fill in)
