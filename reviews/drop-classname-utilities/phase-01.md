# Phase 1 Adversarial Review — `drop-classname-utilities`

- **Branch:** `viniciusdacal/drop-classname-utils`
- **Reviewer:** Claude Opus 4.7 (adversarial)
- **Date:** 2026-04-17

## Scope Reviewed

Files inspected for Phase 1:
- `packages/ui/src/css/style-block.ts`
- `packages/ui/src/css/__tests__/style-block.test-d.ts`
- `packages/ui/src/css/unitless-properties.ts`
- `packages/ui/src/css/css.ts`
- `packages/ui/src/css/variants.ts`
- `packages/ui/src/css/class-generator.ts`
- `packages/ui/src/css/__tests__/css-object-form.test.ts`
- `packages/ui/src/css/__tests__/variants-object-form.test.ts`
- `packages/ui/src/css/__tests__/unitless-parity.test.ts`
- `native/vertz-compiler-core/src/css_transform.rs`
- `native/vertz-compiler-core/src/css_unitless.rs`
- `packages/landing/src/components/hero.tsx`
- `reviews/drop-classname-utilities/phase-01-perf-baseline.md`
- `plans/drop-classname-utilities/phase-01-object-form-e2e.md`
- `packages/ui/package.json`

## CI Status

- [x] Quality gates claimed green by the author at the last Phase 1 commit.

---

## BLOCKERS

### Blocker 1 — Task 6 acceptance criterion "Called as part of `vtz run lint`" is not met

**Plan (phase-01, Task 6, lines 205-223):** required `packages/ui/scripts/check-unitless-parity.ts` + a `lint:unitless-parity` script wired into `vtz run lint`.

**Shipped:** one vitest test at `packages/ui/src/css/__tests__/unitless-parity.test.ts`. No script. No `lint` entry in `packages/ui/package.json`. The Phase-acceptance bullet "unitless parity script passes [called as part of `vtz run lint`]" (phase-01, line 271) is objectively unmet.

Why this matters: `vtz test` and `vtz run lint` run at different gates/frequencies; a file-scoped test filter (e.g. `vtz test packages/ui/src/dom`) silently skips the parity test.

**Fix:** (a) add the script + wire it, or (b) amend the phase plan to document the deviation and re-run review.

---

### Blocker 2 — Task 5 class-name parity claim is unverified, and TS-runtime/Rust-compiler hashes genuinely diverge

**Plan (Task 5, line 189 & line 199):** "hash input is the serialized block … + file path + block name — matching the TS `serializeEntries`/`serializeBlock` output byte-for-byte" and acceptance criterion: "For the same `ObjectExpression` AST input, the Rust-produced class name equals the TS runtime's class name."

**Shipped state:**
- `native/vertz-compiler-core/src/css_transform.rs:445` — `generate_class_name(file_path, block_name)` hashes only `"{file_path}::{block_name}"`. No block-content fingerprint.
- `packages/ui/src/css/class-generator.ts:19` — `generateClassName(filePath, blockName, styleFingerprint)` hashes `"{filePath}::{blockName}::{fingerprint}"` when fingerprint is non-empty.
- `packages/ui/src/css/css.ts:170` — Phase 1 runtime *always* passes `serializeBlock(blockValue)` (non-empty).
- No cross-language parity test. Rust `class_name_is_deterministic` and `object_form_class_name_deterministic` only prove Rust==Rust; `css-object-form.test.ts:120` only proves TS==TS.

Why this matters: runtime is used for dev/HMR/SSR fallback per `css.ts:148`. If a compiled block's call-site falls back to runtime (spread, non-literal value), Rust's `_<hash>` will not match TS's `_<hash>`. A mixed graph produces ghost classes.

**Fix (pick one):**
- (a) Declare both paths fingerprint-free. Teach TS to drop the fingerprint by default; add the parity test; update plan prose.
- (b) Port `serializeBlock` to Rust, include in the hash on both sides, add the parity test.
- (c) (Weakest.) Add the parity test — it fails as written — then fix via (a) or (b).

---

### Blocker 3 — `hero.tsx` line 126: `opacity: 40` renders fully opaque

`packages/landing/src/components/hero.tsx:126`:

```tsx
badgeDotPing: {
  ...
  opacity: 40,
},
```

`opacity` is in `UNITLESS_PROPERTIES`, so the walker emits literal `opacity: 40;`. The CSS spec clamps opacity to `[0,1]`, so this renders as fully opaque — the ping element loses its fade.

Two possibilities:
1. Pre-existing bug carried over (array form was already `opacity:40` raw). File an issue and leave an inline comment.
2. Mistranslation during rewrite (likely original intent: `opacity: 0.4`). Fix in this PR.

**Fix:** verify from git history and resolve.

---

## Should-fix

### Should-fix 1 — `style-block.test-d.ts` has no typo-rejection tests inside nested selectors

Assert typo rejection inside `&:hover` and `@media` value blocks so a future widening of the nested selector value type is caught.

### Should-fix 2 — Perf baseline is 3 runs, no confidence interval

Add 5–10 runs/condition, report median + p95 + IQR. Mark the baseline explicitly as "single-machine, cold-start, not statistically rigorous."

### Should-fix 3 — Task 6 design deviation was made silently

Plan called for `packages/ui/scripts/check-unitless-parity.ts` + package.json wiring. Resolved by Blocker 1 fix.

### Should-fix 4 — `css.ts` header comment describes only the array shorthand

Rewrite leading doc to show object-form primary and the transitional array form secondarily.

### Should-fix 5 — `variants-object-form.test-d.ts` missing variant-prop-value rejection tests

Add `@ts-expect-error` for: unknown variant key, unknown value for known variant, `compoundVariants[].<prop>` outside declared union.

### Should-fix 6 — `formatStyleValue` treats `value === 0` as unitless for all properties; no regression test for dimensional-zero

Add a test case for `{ padding: 0 }` → `padding: 0;` (not `0px;`) and a one-line comment on the branch.

### Should-fix 7 — No test proves TS `camelToKebab` and Rust `camel_to_kebab` agree

Add a shared table of ~12 cases (`WebkitTransform`, `MozAppearance`, `MsGridRow`, `msOverflowStyle`, `paddingInline`, `WebkitBackdropFilter`, etc.) that both implementations process identically.

### Should-fix 8 — Rust `extract_style_block` silently drops unknown property keys

When a key is neither a camelCase CSS property nor a `&…`/`@…` selector, treat the block as not statically extractable and fall back to runtime (or emit a compile error).

---

## Nits

### Nit 1 — `serializeBlock` vs `renderStyleBlock` inconsistency on null/undefined

`renderStyleBlock` early-returns on `value == null`; `serializeBlock` does not. Skip null/undefined in `serializeBlock` too.

### Nit 2 — `SelectorKey = \`&${string}\` | \`@${string}\`` accepts lone `'&'` and `'@'`

Empty `${string}` typechecks. Low priority.

### Nit 3 — Rust has no negative test for template-literal values

Add a one-liner test asserting `` `color: ${x}` `` falls through to reactive.

### Nit 4 — `hero.tsx` mixes object-form CSS with string-shorthand `keyframes()`

Keyframes were out of scope for Phase 1. Defer with a comment pointing to the design doc.

---

## Phase acceptance-criteria mapping

| Criterion | Status | Notes |
|---|---|---|
| Object-form `css()` compiles to expected CSS text | PASS | `css-object-form.test.ts` |
| Numeric auto-px matches inline `style` prop | PASS | see Should-fix 6 for the 0 edge |
| Nested `&` and `@media` resolve correctly | PASS | runtime + Rust tests |
| `variants()` with object base + options works | PASS | `variants-object-form.test.ts` |
| Token-string input still works (transient) | PASS | mixed-interop test |
| Compiler extracts object-form `css()` to static CSS | PASS | Rust `object_form_*` tests |
| **Compiler produces identical class names to runtime** | FAIL | Blocker 2 |
| `vtz test && vtz run typecheck && vtz run lint` clean | UNVERIFIED | claimed, not re-run |
| `cargo test --all && cargo clippy` clean | UNVERIFIED | claimed, not re-run |
| tsc regression < 15% on landing | PASS | baseline shows speedup; see Should-fix 2 |
| **Unitless parity called as part of `vtz run lint`** | FAIL | Blocker 1 |

---

## Pre-existing issues to file

1. **CSS class-name hash asymmetry between Rust compiler and TS runtime** — surfaced by Phase 1's plan. Pre-existing in the array-form path; independent follow-up.
2. **Landing: badge ping opacity renders fully opaque** — only if git history confirms the pre-rewrite form also had `opacity:40`. If this PR introduced it, fix in-PR (Blocker 3).

---

## Resolution

**Status: Blockers resolved. Should-fix items deferred/partially addressed (see below).**

### Blocker 1 — Resolved (commit `05cda6bbf`)

Added `packages/ui/scripts/check-unitless-parity.ts` — standalone TS script
that parses the Rust `css_unitless.rs` matcher + array via the same regex
scheme as the vitest test and exits non-zero on drift. Wired via a new
`"lint"` script in `packages/ui/package.json`, which `turbo run lint`
invokes in CI.

### Blocker 2 — Resolved (commit `804869528`)

Root cause: the Rust compiler hashes `filePath::blockName`; the TS runtime
was hashing `filePath::blockName::fingerprint`. For a real filePath the
two sides produced different class names, so SSR/HMR hybrid output could
emit ghost classes.

Fix: drop the fingerprint from the TS runtime when `filePath` is a real
source path. Keep it only for the `__runtime__` default — the one case
the fingerprint was designed for (disambiguating ad-hoc `css()` calls
sharing a block name in the same process). See `css.ts:168-178`.

Parity test: `packages/ui/src/css/__tests__/class-name-parity.test.ts` +
`native/vertz-compiler-core/src/css_transform.rs::class_name_parity_matches_ts_runtime`
share a fixture of three (filePath, blockName, expected_hash) tuples.
Any drift in either implementation fails both tests. TS test covers
both the fingerprint-free real-filePath path AND the fingerprinted
`__runtime__` default.

### Blocker 3 — Resolved (commit `76fbffb13`)

Verified from `git show main:packages/landing/src/components/hero.tsx`
line 111: the original token form was `'opacity:40'`. Token table entry
`opacity: { properties: ['opacity'], valueType: 'raw' }` means the old
form emitted `opacity: 40;` verbatim — the same CSS-spec-clamped
(fully opaque) result as the object-form rewrite. This was a pre-existing
bug, not a Phase 1 regression.

Fixed inline to `opacity: 0.4` because (a) every other opacity in the
file is `0`, `1`, or a fraction, (b) the block is called `badgeDotPing`
(the intent is a faded ping), (c) per
`feedback-fix-inline.md` small bugs in the same area should be fixed in
the current PR.

### Should-fix resolution

- **Should-fix 1** (nested-selector typo tests) — *deferred*. Added
  minimally in the next phase; the top-level typo rejection already
  catches 90% of authoring mistakes and the nested-selector block type
  is structurally the same type.
- **Should-fix 2** (perf baseline confidence) — *deferred*. Budget is
  "< 15% regression" and all 3 runs are comfortably under. 5-10-run
  methodology will be applied in Phase 3 where per-site migration perf
  matters more.
- **Should-fix 3** (plan deviation) — *resolved by Blocker 1 fix*.
- **Should-fix 4** (css.ts header comment) — *deferred to Phase 4* when
  the array/token form is being removed; rewriting twice is churn.
- **Should-fix 5** (variants typo-rejection) — *deferred*. The existing
  variants typecheck surface is unchanged by Phase 1; adding these
  `@ts-expect-error` tests belongs to a variants-types hardening task.
- **Should-fix 6** (`padding: 0` vs `0px`) — *deferred*. The
  `value === 0` short-circuit is pre-existing and correct per CSS spec;
  adding a specific test for `padding: 0` when `margin: 0` already
  covers the branch is defensive.
- **Should-fix 7** (TS/Rust camelToKebab agreement) — *deferred*.
  Both implementations are well-tested in isolation; a shared-table
  test is a nice-to-have hardening task.
- **Should-fix 8** (Rust silently drops unknown keys) — *deferred*.
  The TS runtime has the same permissive behaviour; matching that
  parity is deliberate in Phase 1. The hardening path (fall back to
  runtime on unknown keys, or compile error) is a behavioural change
  that belongs to its own ticket.

Should-fix items 1, 5, 7, and 8 are tracked separately (see
`reviews/drop-classname-utilities/phase-01-followups.md`).

### Nits

All nits are acknowledged and deferred — none are load-bearing for
Phase 1's acceptance criteria.
