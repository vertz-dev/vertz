# Phase 1: Route `ref` JSX prop through `__ref` runtime helper

- **Author:** vertz-tech-lead
- **Reviewer:** adversarial-review-agent
- **Commits:** af51f48f7
- **Date:** 2026-04-18

## Changes

- `.changeset/fix-ref-callback-compiler.md` (new)
- `native/vertz-compiler-core/src/import_injection.rs` (modified — `__ref` added to `DOM_HELPERS`)
- `native/vertz-compiler-core/src/jsx_transformer.rs` (modified — `process_attr` emits `__ref(el, expr)`; two new Rust tests)
- `native/vertz-compiler/__tests__/jsx-transform.test.ts` (modified — asserts `__ref(` in output)
- `packages/ui-server/src/__tests__/ref-integration.test.ts` (new — helper unit tests + compile-parse tests gated on `__NATIVE_COMPILER_AVAILABLE__`)
- `packages/ui/src/dom/__tests__/ref.test.ts` (new — direct helper tests)
- `packages/ui/src/dom/index.ts` (modified — export `__ref`)
- `packages/ui/src/dom/ref.ts` (new — `__ref` helper)
- `packages/ui/src/internals.ts` (modified — re-export `__ref`)

## CI Status

- [ ] Quality gates not yet confirmed at HEAD (not run as part of this review — author's responsibility before merge).

## Review Checklist

- [x] Delivers what the ticket asks for — callback `ref` no longer produces a `SyntaxError`
- [x] TDD compliance — helper + compiler tests added; negative assertion `!result.contains("}.current = __el0")` is a real regression guard
- [~] No type gaps — minor: `__ref` generic signature is sound but broader than the JSX intrinsic type (see Nit)
- [x] No security issues
- [x] Public API matches design — new internals helper, no public surface change

## Findings

### Blocker — none

### Should fix

**1. Ref fires BEFORE children are appended in compiled output, contradicting the runtime.**
`native/vertz-compiler-core/src/jsx_transformer.rs:1209` pushes the ref statement into `stmts` alongside the other attribute stmts, which get emitted *before* `__enterChildren(__el0)` / `__append` at lines 1223-1231. Verified by emitting for `<div ref={myRef}><span>hi</span></div>`:

```
const __el0 = __element("div");
__ref(__el0, myRef);                     // ← ref invoked with empty element
__enterChildren(__el0);
__append(__el0, ... span ...);
__exitChildren();
return __el0;
```

Compare with `packages/ui/src/jsx-runtime/index.ts:253` which explicitly states "Assign ref after element is fully constructed with children" and applies ref only after `applyChildren()` / deferred IDL. This is a divergence between the runtime and the compiled output for any callback ref that measures geometry (`getBoundingClientRect`), runs `focus()`, or reads children. The exact bug #2788 reproducer (`ref + innerHTML`) happens to be fine because `innerHTML` is the last stmt emitted, but the moment the user writes `<div ref={(el) => el.querySelector('.foo')}>…</div>` it silently returns `null`. Fix: treat `ref` like `deferredIdl` and append after `__exitChildren()` / `__html(...)`.

**2. `__spread` still uses the old object-only ref logic.**
`packages/ui/src/dom/spread.ts:53-58` does `if (value && typeof value === 'object' && 'current' in value)` — callback refs in a spread (`<div {...{ ref: (el) => {} }} />`) are silently dropped. Now that `__ref` exists, `__spread` should delegate to it for parity with the per-attribute path. No test covers spread refs at all.

**3. Integration test actually runs zero compiler assertions on `vtz test`.**
`packages/ui-server/src/__tests__/ref-integration.test.ts` gates its compile-and-parse tests on `__NATIVE_COMPILER_AVAILABLE__`. The preload at `packages/ui-server/src/__tests__/preload-mock-native-compiler.ts:17-29` sets this to `false` under the vtz runtime (the default for `vtz test`). So the helpful `new Function(result.code)` syntactic-validity test only exercises the bug on Bun CI runs. The Rust-level tests still cover the emission string, so coverage isn't zero — but the doc comment claims "Exact repro from issue #2788" when in reality the ONLY test that compiles-and-parses runs on bun only. Recommendation: add a pure Rust-side test that asserts `new_function_parseable(result)` or at minimum add a comment explaining the gate so future readers don't assume CI is exercising it.

### Nit

**4. Type gap in `__ref` signature.**
`packages/ui/src/dom/ref.ts:10` uses `Ref<T> | ((el: T) => void)` with `T` inferred from `el`. The JSX intrinsic `ref` prop at `packages/ui/src/jsx-runtime/index.ts:110` is `Ref<unknown> | ((el: Element) => void)` — wider. Doesn't cause bugs because compiler output isn't type-checked, but the two signatures diverging invites drift. Consider aligning with the JSX intrinsic type.

**5. "Does not throw on object without `current`" test is misleading.**
`packages/ui/src/dom/__tests__/ref.test.ts:28-32` passes `{}` cast to `{ current: HTMLElement }` and asserts `not.toThrow()`. But the implementation has `if ('current' in ref)` — so it silently skips. The test passes because of a *safety guard*, not by design. Either remove the guard (no real user passes `{}`) or document that it's defensive against malformed refs.

**6. `ref_callback_with_inner_html` Rust test doesn't assert ordering.**
`native/vertz-compiler-core/src/jsx_transformer.rs:2930-2945` checks that both `__ref(` and `__html(` appear but doesn't check order relative to each other or to `__enterChildren`. If finding #1 is fixed, add an ordering assertion here.

## Resolution

Follow-up commit addresses the substantive findings.

**Finding #1 (ref ordering) — FIXED.** `transform_element` now deferrs the
`ref` stmt (via new `is_ref_attr` helper) and appends it after both
children and deferred IDL statements, matching the runtime `jsx()`
factory order. New Rust test `ref_applied_after_children` asserts
`__ref(__el0, …)` appears after `__exitChildren()` for an element with
children.

**Finding #2 (spread refs) — FIXED.** `packages/ui/src/dom/spread.ts`
now delegates to `__ref(el, value)` instead of the inline object-only
check, so callback refs flow through `{...props}` spreads too. New
test in `spread.test.ts` asserts the callback is invoked.

**Finding #6 (missing ordering assertion) — RESOLVED** via the new
`ref_applied_after_children` test.

**Finding #3 (integration test coverage under vtz)** — accepted as a
documented gap. The Rust tests cover the emission string and ordering.
The `new Function(result.code)` parse assertion only runs on bun CI —
same pattern as the existing `inner-html-integration.test.ts`. Not a
regression introduced by this PR.

**Findings #4, #5 (nits)** — declined. The `__ref` signature is
deliberately narrower (typed per-call site) and the defensive guard
for malformed refs is cheap insurance.
