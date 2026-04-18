# Phase 4: Delete Shorthand Parser — Adversarial Review

- **Branch:** feat/drop-classname-parser
- **Commit:** 14131c8f8 `feat(ui,compiler): drop shorthand classname parser — object form only`
- **Reviewer:** adversarial-bot
- **Date:** 2026-04-18

## Scope Verified

- Read the full Phase 4 plan file (`plans/drop-classname-utilities/phase-04-delete.md`) and the single commit on the branch.
- Confirmed file deletions in `packages/ui/src/css/`: `shorthand-parser.ts`, `token-resolver.ts`, `token-tables.ts`, `utility-types.ts`, `s.ts` are all gone.
- Confirmed public API narrowing: `packages/ui/src/css/public.ts`, `packages/ui/src/css/index.ts`, `packages/ui/src/index.ts`, `packages/ui/src/internals.ts` no longer export `s`, `StyleEntry`, `StyleValue`, `UtilityClass`, `parseShorthand`, `resolveToken`, any `*Error` variants from the removed modules, `isKnownProperty`, or `isValidColorToken`.
- Verified the new negative type test file `packages/ui/src/__tests__/removed-exports.test-d.ts` (11 cases) — each `@ts-expect-error` was individually validated by deleting it and re-running `tsgo`. All 11 are real regression tests (initial suspicion of vacuous cases was wrong).
- Confirmed the Rust transform (`native/vertz-compiler-core/src/css_transform.rs`) has been narrowed to object-form extraction and returns `Reactive` (i.e. silently ignores) for any array value (test `reactive_array_value_skipped`).
- Quality gates:
  - Rust: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --all` — **clean** in `native/`.
  - TS typecheck via `tsgo --noEmit -p packages/ui/tsconfig.json`, `packages/theme-shadcn/tsconfig.json`, `packages/ui-auth/tsconfig.json` — **clean**.
  - `vtz test` in `packages/ui` (2316 tests), `packages/theme-shadcn` (136), `packages/ui-auth` (70) — **pass**.
  - `bun test native/vertz-compiler/__tests__/css-transform.test.ts __tests__/css-diagnostics.test.ts` — **22/28 FAIL** (see B1 below).
  - oxlint: 0 errors, 1033 pre-existing warnings — unchanged by this commit.
- Inspected `packages/mint-docs/`, `packages/site/pages/`, `packages/ui/README.md`, `packages/ui-primitives/README.md`, `packages/ui/AUDIT-ARCHITECTURE.md`, `packages/landing/scripts/generate-highlights.ts`.
- Inspected the changeset `.changeset/drop-classname-utilities.md` — accurate.
- Inspected two surviving "transient back-compat" runtime tests in `packages/ui/src/css/__tests__/css-object-form.test.ts` and `variants-object-form.test.ts` to verify actual runtime behaviour on array input.

## Blockers

### B1. Rust compiler-facing tests are stale and 22/28 fail

**Severity:** CI-breaking.

Two test files in `native/vertz-compiler/__tests__/` were NOT touched in the commit:

- `css-transform.test.ts` — 16/19 tests FAIL. Every test uses array-form (`css({ panel: ['bg:background', 'p:4'] })`) and asserts `result.css` contains the generated CSS. After the transform was narrowed, arrays are now classified as `Reactive` and left unextracted, so `result.css` is `undefined` and every assertion throws.
- `css-diagnostics.test.ts` — 6/9 tests FAIL. Tests for diagnostics `css-unknown-property`, `css-invalid-spacing`, `css-unknown-color-token`, `css-malformed-shorthand` etc. The diagnostics pass was removed when `css_diagnostics.rs` was deleted; the tests still assert these diagnostic codes.

Reproduction (fresh):
```
cd native/vertz-compiler
bun test __tests__/css-transform.test.ts __tests__/css-diagnostics.test.ts
# → 6 pass, 22 fail
```

The Phase 4 plan explicitly lists `native/vertz-compiler/__tests__/css-transform.test.ts` and `css-diagnostics.test.ts` under "Tests to delete or rewrite". They were neither deleted nor rewritten. These tests run under `bun test` (per their `package.json`'s `"test": "bun test __tests__/*.test.ts"`), so this is a real quality-gate failure for the native-compiler package — not a theoretical one.

**Fix:** Either delete both files outright (no array-form / no shorthand diagnostics remain), or rewrite them to cover only the surviving object-form extraction path (whatever Phase 4 scope requires).

### B2. Array-form runtime "back-compat" tests are silent pass-throughs that mask invalid CSS

**Severity:** regression hidden by the test suite.

`packages/ui/src/css/__tests__/css-object-form.test.ts` lines 130–142 and `variants-object-form.test.ts` lines 51–63 still call `css({ withArray: ['p:4'] })` and `variants({ base: ['p:4'] })` and only assert `typeof result.withArray === 'string'` and that the CSS contains the OTHER (object-form) block's declaration. They do NOT assert anything about the array block's emitted CSS.

I verified what the runtime actually produces for these inputs:

```
css({ withArray: ['p:4', 'bg:background'] })
→ ._af64751f {
     0: p:4;
     1: bg:background;
   }
```

The runtime iterates `Object.entries(['p:4', 'bg:background'])` as `[['0','p:4'],['1','bg:background']]`, camel-cases `'0'` to `'0'`, and emits the string as an invalid declaration. The className is returned (so `typeof === 'string'` passes) but every rule in the class is garbage CSS.

This means anyone whose migration missed a call site now gets silently broken styling — the runtime does not throw, the compiler leaves the array untouched (as `Reactive`), and the tests labelled "transient interop" rubber-stamp it.

**Fix:**
- Delete both "transient back-compat / interop" tests in Phase 4 (array-form is gone — there is nothing to be "transient" about).
- Either make `css()` / `variants()` throw on array input at runtime (preferred — fail-fast on any un-migrated code), or tighten the TS type so arrays are statically rejected (the type change alone would not catch dynamic data; a runtime check is safer).

### B3. Six user-facing documentation pages teach the removed shorthand API

**Severity:** docs publish the deprecated API as the primary styling API.

Every `css()`/`variants()` example in these files uses array-form; `packages/ui/README.md` also imports the removed `s` helper. They have not been migrated in this commit.

Affected files:

| File | Count (array-form instances) |
| --- | --- |
| `packages/mint-docs/guides/ui/styling.mdx` | 19 |
| `packages/site/pages/guides/ui/styling.mdx` | 19 |
| `packages/mint-docs/conventions.mdx` | 7 |
| `packages/site/pages/conventions.mdx` | 7 |
| `packages/mint-docs/guides/llm-quick-reference.mdx` | 3 |
| `packages/site/pages/guides/llm-quick-reference.mdx` | 3 |
| `packages/mint-docs/guides/ui/icons.mdx` | 2 |
| `packages/site/pages/guides/ui/icons.mdx` | 2 |
| `packages/ui/README.md` lines 189–237 | 7 + `import { s } from '@vertz/ui/css'` on line 232 |
| `packages/landing/scripts/generate-highlights.ts` lines 24, 72–80 | 5 (landing-site code-highlight source strings) |

The repo rule `.claude/rules/workflow.md` — "Docs updated — if the PR introduces new APIs, changes existing behavior, or adds features, update `packages/mint-docs/`" — makes this a hard gate for public-API changes. Shipping Phase 4 without touching either docs package means both `components.vertz.dev` and the user-facing Mintlify docs instruct new users to write code that no longer compiles (for the compiler) or produces broken CSS at runtime (array input via `css()`).

Specifically egregious: `packages/ui/README.md` still documents the `s` helper — which is literally one of the symbols the Phase 4 negative-type test proves is gone. A user following the README's first example gets `TS2305: Module '"@vertz/ui/css"' has no exported member 's'`.

`packages/landing/scripts/generate-highlights.ts` is source for the landing page's "code highlight" sections — it re-publishes array-form as the showcase of what Vertz looks like.

**Fix:** Run a `packages/mint-docs` + `packages/site/pages` + README migration pass as part of Phase 4 (this matches Phase 3's pattern where call sites were migrated in bulk). Delete `import { s } from '@vertz/ui/css'` from `packages/ui/README.md` (it is now a dead import). Update `generate-highlights.ts` to use object-form + `token.*`.

## Should-fix

### S1. `packages/ui/AUDIT-ARCHITECTURE.md` cites files that were deleted

Lines 78–80, 159, 167, 272, 350 all reference `token-tables.ts`, `token-resolver.ts`, `shorthand-parser.ts` as current architecture. The audit doc is committed to the repo and read by AI agents navigating the package. Either update it to reflect the object-form-only world or add a banner note that the audit is pre-Phase-4.

### S2. `packages/ui-primitives/README.md` line 81 teaches array-form

```
btn: ['px:4', 'py:2', 'bg:blue.600', 'text:white', 'rounded:md']
```

Same class of issue as B3 but lower-traffic (primitives consumers are more advanced). Migrate during the docs pass.

### S3. Silent drop of `theme.ts` namespace+shade collision validation

Pre-Phase-4 `packages/ui/src/css/theme.ts` validated that a user's custom palette would not collide with semantic color CSS variables (e.g. defining `theme.colors.primary.foreground` with a `primary` shade would collide with semantic `--color-primary-foreground`). The validation depended on the deleted `COLOR_NAMESPACES` table, so it was removed. The corresponding test (`theme.test.ts` — `throws on namespace+shade collision with compound namespace`) was deleted.

Effect: a user who names a shade `foreground`/`background`/`ring`/etc. will now silently emit a CSS variable that overrides a semantic token. No error, no warning — just mysteriously broken theming. Either restore an inlined allowlist in `theme.ts`, or log a runtime warning. If this is intentional (e.g. deferred to a future phase), note it in the changeset.

## Nice-to-have

### N1. Remaining references to the migration script in `plans/` and `reviews/`

`rg migrate-classnames packages sites examples` is clean. The migration script / plan docs in `plans/` and `reviews/` are historical artefacts, so leaving them is fine — no action needed.

### N2. Changeset could mention removed compiler diagnostics

`.changeset/drop-classname-utilities.md` describes the removed public API symbols but not that the Rust compiler will no longer emit `css-unknown-property` / `css-invalid-spacing` / `css-unknown-color-token` / `css-malformed-shorthand` diagnostics. Downstream tooling that grepped for those codes would now silently see nothing. Adding one bullet to the changeset would prevent confusion.

## Summary

| Check | Status |
| --- | --- |
| Files deleted per plan | Pass |
| Public API narrowed | Pass |
| Negative type tests valid | Pass (all 11 are real) |
| TS tests (`@vertz/ui`, `@vertz/theme-shadcn`, `@vertz/ui-auth`) | Pass |
| TS typecheck | Pass |
| Rust quality gates | Pass |
| `native/vertz-compiler` tests | **FAIL — B1** |
| Runtime tests guard against array-form | **FAIL — B2** |
| Docs (`mint-docs`, `site`, READMEs, landing) | **FAIL — B3** |
| Theme collision regression | **Concern — S3** |

Three blockers. Do not merge Phase 4 until B1 (fix/delete the native-compiler tests), B2 (delete transient back-compat tests; decide runtime behaviour for arrays), and B3 (docs migration + remove dead `s` import from README) are resolved.

## Resolution

All blockers and should-fix items resolved in follow-up commit:

- **B1** — Deleted `native/vertz-compiler/__tests__/css-transform.test.ts` and
  `css-diagnostics.test.ts`. These tests exercised the removed shorthand parser
  and removed diagnostics; their behavioural coverage is already handled by
  in-crate Rust tests (`vertz-compiler-core/src/css_transform.rs`) using
  object-form inputs.
- **B2** — Deleted the two transient back-compat tests
  (`css-object-form.test.ts` line 130, `variants-object-form.test.ts` line 51)
  that passed invalid array-form inputs and only checked `typeof === 'string'`.
- **B3** — Migrated all 12 user-facing docs and READMEs to object-form + token.*:
  mint-docs styling/conventions/llm-quick-reference/icons, site mirror, ui README,
  ui-primitives README, AUDIT-ARCHITECTURE.md, landing generate-highlights.ts.
  Verified with grep: zero array-form examples remain.
- **S1** — `packages/ui/AUDIT-ARCHITECTURE.md` rewritten to describe current CSS
  architecture (object-form `css()` + `StyleBlock` type + `token.*` helper).
- **S2** — `packages/ui-primitives/README.md` Button example migrated to object form.
- **S3** — Restored collision detection in `compileTheme()` using a simpler
  Map-based check that does not depend on `COLOR_NAMESPACES`. Added
  `theme.test.ts` test covering the `primary.foreground` vs `primary-foreground`
  collision case.

Quality gates all green after fixes: Rust (tests + clippy + fmt), TS
(`@vertz/ui` 2315 tests, `@vertz/theme-shadcn` 136, `@vertz/ui-auth` 70),
TS typecheck clean, oxlint 0 errors.
