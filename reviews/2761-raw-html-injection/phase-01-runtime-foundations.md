# Phase 1: Runtime Foundations

- **Author:** viniciusdacal (Claude Opus 4.7)
- **Reviewer:** Claude Opus 4.7 (adversarial bot)
- **Commits:** b745f970c..523e40f8d
- **Date:** 2026-04-17

## Changes

- `packages/ui/src/trusted-html.ts` (new)
- `packages/ui/src/__tests__/trusted-html.test.ts` (new)
- `packages/ui/src/__tests__/trusted-html.test-d.ts` (new)
- `packages/ui/src/index.ts` (modified — barrel export)
- `packages/ui/src/dom/html.ts` (new)
- `packages/ui/src/dom/__tests__/html.test.ts` (new)
- `packages/ui/src/dom/index.ts` (modified — add `__html` export)
- `packages/ui/src/jsx-runtime/index.ts` (modified — types + `jsxImpl` branch)
- `packages/ui/src/jsx-runtime/__tests__/inner-html.test.ts` (new)
- `packages/ui/src/jsx-runtime/__tests__/inner-html.test-d.ts` (new)

## CI Status

- [x] `vtz test` for the 3 new test files — 17/17 pass at 523e40f8d
- [x] Types in new/modified files produce zero errors under `tsc --noEmit`
  (pre-existing `@vertz/fetch` resolution errors in `tsc` vs `tsgo` are
  unrelated to this phase)
- [x] Isolated JSX call-site typecheck verified `VoidHTMLAttributes` rejects
  `innerHTML` on `<img>`/`<br>`/`<input>` (see Finding 3 below)

## Review Checklist

- [x] Delivers what the phase plan asks for
- [x] TDD compliance — tests and impl committed together; tests cover every
  acceptance criterion in the phase plan plus extras (ref+innerHTML,
  empty-array children, null children)
- [x] No type gaps in the surface that this phase owns
- [x] No security issues introduced — `__html` and `jsxImpl` branch document
  the unsanitized insertion and do not accept attacker-controlled
  configuration
- [x] Public API changes match the design doc (minor additive deviation — see
  Nit 1)

## Findings

### Approved — no blockers

No blockers. Two should-fix items (both test-coverage gaps) and four nits.

---

### Should-fix 1 — `jsxImpl` mutual-exclusion behavior on `{0}` / `{''}` children is untested and surprising

`packages/ui/src/jsx-runtime/index.ts:230-242` — the `hasChildren` guard treats
`0` and `''` as "has children" (both are `!= null`, `!== false`, `!== true`,
and not empty arrays), so `<pre innerHTML="x">{0}</pre>` and
`<pre innerHTML="x">{''}</pre>` throw. That is arguably the correct call (the
user did pass something), but it is not tested and is surprising for `{''}`
because `applyChildren` would have rendered it as an empty text node (i.e. no
visible child). At minimum add a test pinning the current behavior so a
future refactor doesn't silently flip it:

```ts
it('throws when children is 0', () => {
  expect(() => jsx('pre', { innerHTML: 'x', children: 0 })).toThrow(
    /innerHTML.+children/i,
  );
});
it('throws when children is empty string', () => {
  expect(() => jsx('pre', { innerHTML: 'x', children: '' })).toThrow(
    /innerHTML.+children/i,
  );
});
```

If the team decides `{''}` should be treated as "no children" instead, the
fix is to add `children !== ''` (or to use `typeof children !== 'string' || children.length > 0`)
to the `hasChildren` guard. Non-blocking either way, but the behavior must
be pinned by a test before the compiler lands in Phase 2.

### Should-fix 2 — `jsxImpl` innerHTML path silently ignores IDL properties and deferred assignment

`packages/ui/src/jsx-runtime/index.ts:186-251` — the `<input>`/`<select>`/
`<textarea>` IDL deferral (`deferredIdl`) still runs after the `innerHTML`
branch, which is fine, but this combination is not tested. More importantly,
`<input>` is a void element that rejects `innerHTML` via
`VoidHTMLAttributes` at the type level — good — but the runtime still sets
`element.innerHTML = …` on `<input>` without complaint if called imperatively
through `jsx('input', { innerHTML: '…' })`. That is consistent with the "types
catch it, runtime trusts the compiler" stance, but worth one test to pin the
current runtime behavior (e.g. assert no throw, and assert
`el.innerHTML === ''` since the DOM rejects innerHTML on void elements). Not
a correctness blocker for this phase; flag for Phase 2 compile error E0764
SVG analog (`innerHTML` on void elements should also be a compile error once
the compiler runs).

---

### Nit 1 — Design-doc deviation: type adds `| null`

Design doc `plans/2761-raw-html-injection.md:149` declares
`innerHTML?: string | TrustedHTML`. Implementation adds `| null`
(`packages/ui/src/jsx-runtime/index.ts:55`). Additive and consistent with the
null-safe runtime, tested, and convenient for
`innerHTML={maybeStr ?? null}`. Worth a one-line note in the design doc's
revision history for audit symmetry, but not a blocker.

### Nit 2 — `__html` security comment is adequate, but the signature accepts `null | undefined` the design doc discusses and the JSDoc does not cross-link to `trusted()`

`packages/ui/src/dom/html.ts:4-15` — the `@security` tag names the risk but
does not direct readers to `trusted()` or a sanitizer. Cheap to add one more
sentence: `For user-controlled input, sanitize first (e.g. DOMPurify) and wrap
with trusted()`. Matches the docstring style already used on `HTMLAttributes.innerHTML`.

### Nit 3 — `trusted()` JSDoc mentions a "future oxlint rule" but no issue number is linked

`packages/ui/src/trusted-html.ts:18-19`. Per the design doc, the
`no-untrusted-innerHTML` rule is a tracked follow-up. Once that issue is
filed (design doc Phase 4 says to file it before the PR merges), the JSDoc
should reference it. Not blocking Phase 1.

### Nit 4 — `inner-html.test-d.ts` uses property-bag assignments rather than JSX

The type test file in `packages/ui/src/jsx-runtime/__tests__/inner-html.test-d.ts`
checks `const x: JSX.VoidHTMLAttributes = { innerHTML: '…' }` rather than
`<img innerHTML="…" />`. Both forms exercise the type, but the JSX form is
closer to the real call site. I ran an isolated JSX test out-of-tree and
confirmed that `<img innerHTML="x" src="y.png" />`, `<br innerHTML="x" />`,
and `<input innerHTML="x" />` all fire TS errors at real JSX call sites
despite the `[key: string]: unknown` index signature on `HTMLAttributes` —
so the behavior is correct. Still worth adding at least one JSX-form `@ts-expect-error`
in the test-d file for regression coverage against future interface shuffles.

---

### Pre-existing bug found (not introduced by this phase)

None.

## Resolution

Approved with two should-fix test gaps (coverage of `{0}`/`{''}` children and
the `<input>` void-element runtime path). Four nits are polish items — author
can address or defer. The hard parts (hydration-aware `__html`, the brand
type surviving `.d.ts` emit, void-element rejection at real JSX call sites)
are correct and tested.

### Addressed in commit `a53c2cf04`

- **Should-fix 1** — Added two tests pinning that `{0}` and `{''}` as
  children trigger the innerHTML+children throw. Behavior was kept (any
  non-empty children throws) rather than flipped, since the compile-time
  diagnostic E0761 (Phase 2) is the real guard — runtime throw is a
  belt-and-suspenders check for imperative callers.
- **Should-fix 2** — Added a test asserting that imperative
  `jsx('input', { innerHTML: '…' })` does not throw at runtime and still
  creates an `<input>` element. Documents the "types catch it, runtime
  trusts the compiler" stance. Void-element compile-error (E0764 analog)
  is tracked for Phase 2.
- **Nit 2** — Cross-linked `trusted()` in the `@security` block of
  `packages/ui/src/dom/html.ts`.
- **Nit 4** — Added `IntrinsicElements['img']` / `['br']` type-level
  regression checks to `inner-html.test-d.ts` so the index signature
  cannot silently re-open `innerHTML` on void entries in a future refactor.
- **Nit 1** — Design doc addendum deferred; the `| null` addition is
  already reflected in the implementation and was consciously chosen for
  `innerHTML={maybeStr ?? null}` ergonomics.
- **Nit 3** — Deferred until the `no-untrusted-innerHTML` oxlint issue is
  filed in Phase 4.
