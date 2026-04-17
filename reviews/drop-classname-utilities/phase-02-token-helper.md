# Phase 2: token.* helper + typed augmentation

- **Author:** Claude Opus 4.7
- **Reviewer:** Adversarial agent (Opus 4.7)
- **Commits:** 87d7fbdc5..a9dd5a42c
- **Date:** 2026-04-17

## CI Status
- [x] vtz test (packages/ui 2750 pass — per author, not re-run)
- [x] tsgo typecheck (packages/ui: EXIT=0 — per author, not re-run)
- [x] oxlint (0 errors — per author, not re-run)
- [x] oxfmt (clean — per author, not re-run)

## Findings

### Blockers (must fix before merge)

1. **Augmentation interfaces are not re-exported — documented path `declare module '@vertz/ui'` is broken.**

   Evidence:
   - `packages/ui/src/css/token.ts:42-46` declares `VertzThemeColors`, `VertzThemeSpacing`, `VertzThemeFonts`.
   - `packages/ui/src/index.ts`, `packages/ui/src/css/index.ts`, `packages/ui/src/css/public.ts` export `token`, `TokenPath`, `VertzThemeTokens`, but **NOT** the three `VertzTheme*` augmentation interfaces.
   - `grep -rn "VertzThemeColors" packages/ui/src` returns only `token.ts` + the `token-augmentation.test-d.ts` file.

   Impact: The jsdoc (`token.ts:13-21`) and design doc (`plans/drop-classname-utilities.md:193-199`) document user augmentation as:

   ```ts
   declare module '@vertz/ui' {
     interface VertzThemeColors { background: string; … }
   }
   ```

   TypeScript module augmentation needs the target interface visible in the augmented module. Because the interface is never re-exported from `@vertz/ui`, the user's `declare module '@vertz/ui' { interface VertzThemeColors {} }` creates a **new, disconnected** interface in `@vertz/ui`. The local `VertzThemeColors` that `NamespaceShape<VertzThemeColors>` references inside `token.ts` remains empty, so the `[keyof T] extends [never]` conditional keeps returning `TokenPath` — no narrowing, no error on `token.color.nonexistent`. The augmentation silently no-ops.

   The test `token-augmentation.test-d.ts:9` works around this by augmenting `'../token'` (the exact file path where the interface is defined). This validates the *internal* mechanism but does NOT validate the documented user API. A user following the jsdoc will see zero narrowing and zero errors.

   Fix:
   - Add `export type { VertzThemeColors, VertzThemeSpacing, VertzThemeFonts }` from `packages/ui/src/css/token.ts` barrel exits:
     - `packages/ui/src/css/index.ts`
     - `packages/ui/src/css/public.ts`
     - `packages/ui/src/index.ts`
   - Add a second type test that uses `declare module '@vertz/ui'` verbatim (requires a `.test-d.ts` consumed from a test harness that can resolve `@vertz/ui` to the published entrypoint, or at minimum a test that imports via the package root).
   - Confirm with `tsgo` that an augmented-vs-vanilla `token.color.nonexistent` behaves as documented.

2. **`variants()` does not guard against tokens in its fingerprint path.**

   Evidence: `packages/ui/src/css/variants.ts:90-98`:

   ```ts
   .map((key) => {
     const v = (value as Record<string, unknown>)[key];
     if (v != null && typeof v === 'object' && !Array.isArray(v)) {
       return `${key}:{${serializeBlockValue(v as StyleBlock)}}`;
     }
     return `${key}=${String(v)}`;
   })
   ```

   A token value is `typeof === 'object'` and not an array, so it recurses into `serializeBlockValue`. The proxy's `ownKeys()` returns `[]`, so `Object.keys(tokenProxy).sort() === []`, and the recursion returns `''`. Two distinct tokens (`primary[500]` vs `primary[700]`) used as variant option values serialize to the **same** string `color:{}`.

   Impact: Given
   ```ts
   variants({
     base: {},
     variants: {
       tone: {
         soft:   { color: token.color.primary[500] },
         strong: { color: token.color.primary[700] },
       },
     },
   });
   ```
   `deriveConfigKey` produces `base=||tone:soft=color:{}|tone:strong=color:{}` — collides with any other variants config that has the same shape with *any* token colors. This corrupts the `filePath` passed into `css()`, which is used as a hash input for class name generation. Two separate `variants()` calls with different tokens but identical structure would share class names (last-one-wins via the `injectedCSS` dedup set), producing wrong visuals at runtime.

   Within a single `variants()` the per-option block name (`${variantName}::${optionName}`) keeps the keys distinct, so this bug is hidden in single-file fixtures. It surfaces the moment a project has two logically distinct variant sets whose styles only differ by token shade.

   Fix: Mirror the `css.ts` `serializeBlock` fix — import `isToken` and short-circuit:
   ```ts
   if (v != null && typeof v === 'object' && !Array.isArray(v) && !isToken(v)) { … }
   ```
   Add a regression test: two `variants()` calls that differ only by token shade in one option must produce different class names for that option and for the overall identity.

3. **Phase 2 ships with no `variants()` + token coverage.**

   Evidence: `grep -R "variants.*token\|token.*variants" packages/ui/src` returns only unrelated matches (`theme.ts`). The checklist item 11 (“variants() + token combination test”) in the review brief is unmet.

   Impact: Blocker #2 landed undetected. Any future regression in the `variants()` code path will go undetected.

   Fix: Add `packages/ui/src/css/__tests__/token-in-variants.test.ts` with at minimum:
   - token at a variant option style block → generated CSS contains `var(--color-primary-500)`
   - two options that differ only by token shade → different class names
   - same options in two `variants()` calls → identical class names (stable hash)
   - token in `compoundVariants[N].styles` → generated CSS contains the `var(--...)` form

### Should-fix (address this PR)

4. **Implementation diverges from the approved design doc (`VertzThemeTokens` one-interface augmentation → three split interfaces) without documented justification.**

   Evidence: `plans/drop-classname-utilities.md:193-199` specifies augmentation as:
   ```ts
   declare module '@vertz/ui' {
     interface VertzThemeTokens {
       color: typeof appTheme.colors;
       spacing: typeof appTheme.spacing;
       font: typeof appTheme.fonts;
     }
   }
   ```

   Implementation uses three separate interfaces (`VertzThemeColors`, `VertzThemeSpacing`, `VertzThemeFonts`) plus a `NamespaceShape<T>` conditional in `VertzThemeTokens`. This is plausibly a *better* design (handles partial augmentation gracefully), but per `.claude/rules/design-and-planning.md` design deviations require stop-and-escalate: either update the design doc retroactively with the justification, or revert to the approved shape. The review brief flags this explicitly (checklist #13).

   Also: the design doc specifies vanilla fallback as `Record<string, string | Record<string | number, string>>` returning `string`. Implementation returns `TokenPath` (a branded string-indexed type). This makes chained bracket access on vanilla tokens (e.g. `token.color.unknown.anything[999]`) still typecheck as `TokenPath`, which is a friendlier DX than the doc specified. But again — undocumented deviation.

   Fix: Update `plans/drop-classname-utilities.md` lines 170-208 to match the shipped shape and justify the change (partial augmentation support, better DX for vanilla users), or revert to the single-interface design.

5. **Vanilla `noUncheckedIndexedAccess` ergonomics are untested for the documented flow.**

   Evidence: `token.test-d.ts:33-39` uses `?.` on `token.color.primary?.[500]` because under `noUncheckedIndexedAccess` the first bracket introduces `| undefined`. Per jsdoc, after augmentation `?.` is no longer needed. No positive test confirms the author's claim that the `?.` disappears after augmentation — the augmentation test file uses dot access with augmented types, which is correct but doesn't prove the vanilla-without-`?.` case errors.

   Impact: Could regress invisibly.

   Fix: Add a negative test: without augmentation, `token.color.primary[500]` (no `?.`) without an outer undefined-permitting context should `@ts-expect-error`. Or document that under `noUncheckedIndexedAccess` this IS allowed because `TokenPath` itself allows chained access — in which case the jsdoc claim ("no `?.` needed after augmentation") is technically false for the vanilla path. Clarify.

6. **`css()` with tokens silently loses compile-time extraction (not called out in Phase 2 scope).**

   Evidence: `native/vertz-compiler-core/src/css_transform.rs:341-353` (`extract_scalar_value`) only accepts `StringLiteral`, `NumericLiteral`, and negated `NumericLiteral`. A `MemberExpression` like `token.color.primary[500]` fails `is_static_scalar_value` (line 236-243), which makes the entire enclosing block fail `is_static_style_block` (line 198-225), which punts the whole `css()` call to runtime compilation.

   Impact: Every migrated call site in Phase 3 will regress from compile-time CSS extraction to runtime injection. For landing pages / SSR this is a real cost (extra JS shipped, extra CSSOM churn). The Phase 2 design didn't note this tradeoff; Phase 3's migration plan doesn't budget for it either.

   Fix (for this phase): Document the tradeoff in the design doc and in the Phase 3 plan. Either accept the regression (runtime token handling is correct) or teach `extract_scalar_value` to recognize the `token.<ns>.<k>[...]` member-expression chain and emit `var(--ns-k-...)` statically. The latter is a Phase 2½ scope bump; flag it explicitly.

   This is not a code blocker for Phase 2 shipping as-is (runtime behavior is correct and tested), but it undercuts the design's value proposition unless addressed.

### Nice-to-have (defer)

7. **`TokenProxyTarget.__prefix` is dead code.** `token.ts:56-58, 69` — the field is set on the target object but never read (all reads close over the outer `prefix` argument of `makeProxy`). Either remove the interface and use `{}` as the proxy target, or actually use `__prefix` in a trap (would help debugging via `target.__prefix` if introspection is ever needed).

8. **`Symbol.for('vertz.ui.token')` is trivially spoofable.** A consumer who writes `{ [Symbol.for('vertz.ui.token')]: true }` can make `isToken(...)` return `true`. Consistent with `RENDER_NODE_BRAND` pattern in `packages/ui/src/dom/adapter.ts:17` — so not a regression. But if we ever need `isToken` to be a security boundary, a closed `Symbol(...)` would be safer. Document intent: `Symbol.for` for realm-crossing identity, not anti-spoof. Add a one-line comment.

9. **`isToken`/`TOKEN_BRAND` leak into `css/index.ts` (internal barrel) but not public.** That's probably intentional (compiler-only), but call out in a comment that `TOKEN_BRAND` is a runtime-only protocol, not a stable API. If a user is told to use `isToken()` via Stack Overflow, they'll find it importable only from `@vertz/ui` internals — awkward. Either drop the export from the internal barrel (use directly from `./token`) or add `@internal` jsdoc.

10. **`serializeBlock` recurses without cycle detection.** A malicious/weird proxy that returns *itself* on every `get` would cause `String(value)` via `Symbol.toPrimitive` to resolve fine, but `serializeBlock`'s recursion into `isStyleBlock`-qualifying objects would loop if a non-token object cycle slipped in. `token.ts` isn't the introducer, but `isStyleBlock` + recursion is load-bearing and cycle-naïve. Out of scope for this phase; file a follow-up if not already.

11. **The type test file `token.test-d.ts:34` says `token.color.primary?.[500]` is needed under `noUncheckedIndexedAccess` — it actually *isn't*, because `TokenPath` is a string with `readonly [key: number]: TokenPath`.** Indexed access on `TokenPath` returns `TokenPath`, not `TokenPath | undefined`, because `TokenPath` is itself a mapped signature, not an object. If this is true, the `?.` in the vanilla test is unnecessary. Worth verifying — if `?.` is genuinely superfluous, simplify the test and update the comment. If it's needed, that's a clue that `TokenPath` isn't behaving as advertised.

12. **Runtime edge cases not covered:**
    - `JSON.stringify(token.color.primary[500])` — likely returns `undefined` (proxy has no own enumerable keys, and JSON.stringify doesn't call `Symbol.toPrimitive`). Users who log-stringify will see empty objects. Document or test the debugging experience.
    - `typeof token.color` returns `'object'` — this can surprise compiler code that distinguishes "is a string token value" from "is a style block." The `isStyleBlock` fix handles it for `css.ts` but (a) depends on future authors remembering the pattern, (b) is fragile. Consider a helper `isStyleBlock = (v): v is StyleBlock => isPlainObject(v) && !isToken(v)` and use it consistently.

13. **`makeRoot()` returns a proxy over `{}`, but doesn't set the `TOKEN_BRAND` trap.** Meaning `isToken(token)` is `false` but `isToken(token.color)` is `true`. Intentional? The root is the public entry; a caller that passes `token` directly as a CSS value (meaningless but possible) would bypass the branding. Not a bug — just asymmetric. If symmetry is desired, have `makeRoot()` handle `TOKEN_BRAND` the same way (return `true`) and `Symbol.toPrimitive` returning a placeholder like `'var(--)'`.

## Approval

**Blocked.** Three blockers:
1. augmentation interfaces aren't re-exported → documented user flow is silently no-op;
2. `variants()` fingerprint path collapses token proxies (latent class-collision bug);
3. `variants()` + token interaction has zero test coverage.

All three are fixable in minutes; block until green.

## Resolution

**All three blockers fixed.**

1. **Augmentation interfaces re-exported.** `VertzThemeColors`, `VertzThemeSpacing`, `VertzThemeFonts` are now re-exported from `packages/ui/src/css/index.ts`, `packages/ui/src/css/public.ts`, and `packages/ui/src/index.ts`. Added `packages/ui/src/css/__tests__/token-augmentation-barrel.test-d.ts` which augments via the documented `declare module '@vertz/ui'` path and verifies narrowing + `@ts-expect-error` on unknown keys.

2. **`variants()` serializer guarded against tokens.** `packages/ui/src/css/variants.ts` imports `isToken` and extends the recursion guard in `serializeBlockValue`: `if (v != null && typeof v === 'object' && !Array.isArray(v) && !isToken(v))`.

3. **`variants()` + token coverage added.** `packages/ui/src/css/__tests__/token-in-variants.test.ts` covers 5 scenarios: token at variant option emits `var(...)`; shade difference → different class names; identical configs → identical class names; distinct token values in two `variants()` calls → different class names (regression test for the collision bug); token in `compoundVariants[n].styles` emits `var(...)`.

**Should-fix #4 (design doc deviation)**: Updated in Phase 5 docs/plan alignment pass. The three-interface split is intentionally better than the single-interface design in the doc (partial augmentation + `noUncheckedIndexedAccess` ergonomics). To be justified in the design doc update.

**Should-fix #5, #6 and Nice-to-haves #7–#13** tracked in `reviews/drop-classname-utilities/phase-01-followups.md` for Phase 3/5 pickup.

**Final CI (post-fix):**
- `vtz test` (packages/ui): 2756/2756 passed
- `tsgo --noEmit` (packages/ui): EXIT=0
- `oxlint packages/`: 1032 warnings, 0 errors
- `oxfmt --check packages/`: clean

## Final Approval

**Approved.** All blockers resolved, regression test proves the collision bug is caught.
