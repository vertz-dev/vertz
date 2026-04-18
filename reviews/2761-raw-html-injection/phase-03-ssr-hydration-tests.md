# Phase 3: SSR + Hydration Integration Tests

- **Author:** viniciusdacal (Claude Opus 4.7)
- **Reviewer:** Claude Opus 4.7 (adversarial bot)
- **Commit:** 8d296249b
- **Date:** 2026-04-17

## Changes

Single commit 8d296249b:

- `packages/ui-server/src/__tests__/inner-html-integration.test.ts` (new, 123 lines) — three Given/When/Then scenarios using happy-dom: (1) SSR + hydration + reactive update, (2) `innerHTML={undefined}`, (3) hydration-warning-quiet.
- `packages/ui/src/dom/html.ts` (modified, +2 lines) — imports and calls `markSubtreeClaimed(el)` at the top of `__html()` as a synchronous pre-step before the deferred effect.
- `packages/ui/src/hydrate/hydration-context.ts` (modified, +15 lines) — adds exported helper `markSubtreeClaimed(el: Element)` that recursively walks descendants and adds each to the dev-mode `claimedNodes` WeakSet.
- `packages/ui/src/dom/__tests__/html.test.ts` (modified, +28 lines / 1 new test) — adds `afterEach(() => endHydration())` cleanup plus one new test (`marks hydrated SSR descendants as claimed so endHydration does not warn`) covering the bug fix at the unit level.

## CI Status

Verified at 8d296249b:

- [x] `vtz test packages/ui/src/dom/__tests__/html.test.ts` — 7/7 pass.
- [x] `vtz test packages/ui-server/src/__tests__/inner-html-integration.test.ts` — 3/3 pass.
- [x] `vtz test packages/ui/` — 2749 pass, 1 pre-existing fail
  (`subpath-exports.test.ts > dist files exist for all subpath exports (post-build)`
  — this test requires a built `dist/` and fails identically on HEAD; unrelated
  to this phase).
- [x] `vtz test packages/ui-server/` — 1297 pass, 58 skipped; 4 load-errors
  (`@vertz/ui-auth` resolution) — all pre-existing from `@vertz/ui-auth`/`@vertz/fetch`
  dist gaps, unchanged from the Phase 2 baseline.
- [x] `tsgo --noEmit -p packages/ui/tsconfig.json` — zero errors on the files
  changed by this commit (`hydrate/*`, `dom/html.ts`, `dom/__tests__/html.test.ts`).
  Pre-existing `@vertz/fetch` and `query.test-d.ts` drift unchanged.
- [x] `oxlint` on changed files — zero new warnings/errors. One pre-existing
  `no-throw-plain-error` warning at `hydration-context.ts:58` (blame: Feb 2026)
  is unrelated to this commit.
- [x] `oxfmt --check` on changed files — clean.
- [x] **Bug-fix red-first verification** — reverted the two source-file edits
  (`packages/ui/src/dom/html.ts` and `packages/ui/src/hydrate/hydration-context.ts`)
  and re-ran the tests. Both the new unit test in `html.test.ts` and scenario
  3 of the integration test fail with the exact diagnostic
  `Expected "[hydrate] 2 SSR node(s) not claimed during hydration:\n  - <b>\n  - text(\"x\")" to be ""`.
  Confirms the tests actually prove the bug and not merely coincide with the
  fix. Scenarios 1 and 2 still pass without the fix — only scenario 3
  catches the regression.

## Review Checklist

- 🟡 **Delivers what the phase plan asks for** — Three scenarios named in the plan are covered, the uncovered runtime bug was fixed with a unit test added in the owning package, and the top-level acceptance (SSR → hydrate → reactive) is nominally exercised. Three gaps vs. the plan (detailed below): the reactive-update step is disconnected from the hydrated element, the `innerHTML={undefined}` client-path assertion is trivial, and the test does not exercise the compiled JSX pipeline (only `__element` + `__html` simulation).
- ✅ **TDD compliance** — The bug-fix unit test was committed alongside the fix. Red-first verified: reverting the fix makes both the unit test and integration scenario 3 fail with a precise, actionable diagnostic.
- ✅ **Type/correctness gaps** — No `any`, no suppressed warnings, no swallowed errors. One `try/catch {}` in the `afterEach` of `html.test.ts` deliberately swallows `endHydration()` errors, which is justified (defensive cleanup when a test did not enter hydration).
- 🟡 **Security considerations** — Test 1 proves the SSR output contains `<pre class="code"><b>x</b></pre>` literal (not entity-escaped), which confirms SSR raw-HTML emission. Test 1 also proves outer-node identity is preserved across hydration (`toBe(preBeforeHydrate)`). Missing: no test specifically exercises the "dangerous" content path (e.g. `<script>`, attacker-styled markup) to confirm Vertz does not sanitize or strip on either side. This is arguably a docs/concern rather than a test gap, but since raw-HTML is the whole point of the feature, pinning one test on `<script>alert(1)</script>` or an on-attribute event handler would be valuable hardening.
- 🟡 **`markSubtreeClaimed` correctness** — The no-op short-circuit when `claimedNodes` is null is correct and cheap. In production builds the call is a single property read + early return. The recursion walks `firstChild`/`nextSibling` synchronously at `__html()` call time, *before* any deferred DOM work runs, which is the correct timing: the SSR children are still present at that instant, they get marked, then `findUnclaimedNodes` (which runs before `flushDeferredEffects` inside `endHydration`) ignores them. Nested `__html` calls on an ancestor and a descendant are a theoretical concern (`innerHTML` + JSX-children is mutually exclusive at compile time, so the only way to hit it is imperative use), but the double-add to a WeakSet is a no-op. Safe.
- ✅ **Integration-test safety rules** — No servers, no WebSockets, no file watchers, no env-var leaks. `console.warn` patches are guarded with `try/finally`. happy-dom is `unregister()`ed in `afterAll`. `root` is removed from `document.body` in `afterEach` with a null-safety guard.
- 🟡 **Hidden coupling** — Test imports `toVNode` via the relative path `../dom-shim` rather than the public `@vertz/ui-server` barrel. `toVNode` is not exported from `packages/ui-server/src/index.ts`. This is consistent with nine sibling tests in the same directory (`ssr-render.test.ts`, `ssr-integration.test.ts`, etc.), but the phase plan's acceptance criterion said "no relative imports into `src/`." Acceptable because this matches the established integration-test pattern in this package; worth a follow-up to promote `toVNode` to the public barrel or add a test-only entrypoint, but not blocking.
- 🟡 **Does the integration test cover all the claims in the commit message?** The commit claims "end-to-end coverage proving innerHTML survives SSR serialization, hydration adoption, and reactive updates." Scenarios 1 and 3 prove the first two; the reactive-update claim is proven only by step 3 of scenario 1, which uses a bare `__element('pre')` *not* inside the mounted/hydrated `#app`. The test establishes that `__html` is reactive (already covered by `html.test.ts`), but does NOT prove that a reactive `__html` effect continues to fire correctly for a node that was hydrated (i.e. no double-binding, no orphaned effect from hydration deferral). See Should-fix 1.
- ✅ **Side-effect / singleton hazards** — happy-dom is process-wide; `GlobalRegistrator.register/unregister` is paired in `beforeAll`/`afterAll`. `beforeEach`/`afterEach` create and remove a fresh root element. `mountedRoots` WeakMap entries are GC'd because nothing else holds the root reference after `afterEach`. `mount()` calls `handle.unmount()` in a `finally` block. One minor leak: test 1 step 3 creates a signal and an `__html` effect on a bare element that are never disposed — the element is GC'd after the test, so the effect's subscriber ref on the signal decays. Benign.

## Findings

### Blockers

**No blockers.** The bug fix is sound, red-first was verified, the three plan scenarios are present, and quality gates are clean.

### Should-fix

#### Should-fix 1 — Reactive-update step is disconnected from the hydrated node

`inner-html-integration.test.ts:67-74` performs the reactive-update step on a bare `__element('pre')` that is never appended to `#app` and never hydrated. Because of that, the assertion proves only what `html.test.ts:34-41` already proves (the `__html` helper is reactive). It does **not** prove that a `__html` effect that was queued as a `deferredDomEffect` during hydration and flushed at `endHydration()` subsequently rebinds correctly for later signal writes.

This matters because the phase plan's scenario explicitly chains all three paths: "renders raw HTML on the server, preserves node identity on hydration, **and applies reactive updates**." The commit message's "reactive updates" claim is therefore only weakly supported.

Fix: after hydration completes in scenario 1, pass the signal through the hydrated `App`, mutate the signal, and assert that the hydrated `<pre>`'s innerHTML updates. Pseudocode:

```ts
const html = signal('<b>x</b>');
const App = () => {
  const el = __element('pre');
  el.setAttribute('class', 'code');
  __html(el, () => html.value);
  return el;
};
root.innerHTML = '<pre class="code"><b>x</b></pre>';
const pre = root.querySelector('pre')!;
const handle = mount(App);
try {
  expect(pre.innerHTML).toBe('<b>x</b>');
  html.value = '<i>y</i>';
  expect(pre.innerHTML).toBe('<i>y</i>');
} finally {
  handle.unmount();
}
```

This would have caught, for example, a refactor where the deferred-effect fix forgot to establish dependency tracking on the first flushed run.

#### Should-fix 2 — `innerHTML={undefined}` client-path assertion is trivial

`inner-html-integration.test.ts:88-90` asserts `jsx('pre', { innerHTML: undefined }).innerHTML === ''`. In `jsxImpl`, `innerHTML !== undefined` is false when `innerHTML` is `undefined`, so the branch at `jsx-runtime/index.ts:230-243` is skipped entirely; the element is created fresh with `<pre>`'s default empty `innerHTML`. The assertion passes trivially without exercising the null-coalesce path (`innerHTML == null ? '' : String(innerHTML)`).

To actually prove "innerHTML set to undefined clears the element," the test would need to start with non-empty content (e.g., a hydrated `<pre><b>prev</b></pre>` or a pre-populated element) and then set `innerHTML={undefined}` via the JSX runtime or via `__html(el, () => undefined)`. The unit test at `html.test.ts:28-31` already covers the `__html` side; the integration test should either (a) delete the trivial assertion, (b) strengthen it to exercise clearing, or (c) add a separate `innerHTML={null}` case that actually hits the branch.

#### Should-fix 3 — Test does not exercise the compiled JSX path

Phase plan acceptance criterion #3: "The test runs against both the jsx-runtime fallback (dev/test) and the compiled path. If the existing integration harness uses the compiler, this is automatic; if not, add a variant that explicitly uses `compile()` from `@vertz/ui-server`."

The test uses manual `__element` + `__html` calls to "simulate compiler output" (comment at line 34). This runs the RUNTIME pipeline end-to-end but does NOT run the COMPILER. A consequence: a regression in the Phase 2 compiler (e.g. `build_inner_html_stmt` stops emitting `__html`, or attribute ordering shifts such that `__html` fires before `setAttribute("class", …)`) is NOT caught by this file.

Phase 2 already has unit tests for compiler emission, so this is a belt-and-suspenders gap rather than a critical hole — but the phase plan explicitly asked for one. Either add one more scenario that runs `compile()` on a real JSX source (`<pre className="code" innerHTML={'<b>x</b>'} />`) and `eval`/`import()`s the emitted module, or explicitly document in the phase retrospective that this was deferred.

### Nits

#### Nit 1 — No XSS / dangerous-markup proof test

The feature's selling point is un-escaped HTML. No scenario feeds `<script>alert(1)</script>` or an on-attribute handler string through the round-trip to confirm that neither the SSR serializer nor the hydration adopter escapes/strips it. One pinned assertion (serverHtml contains the script tag verbatim, post-hydration `innerHTML` contains the script tag verbatim) would document the deliberate behavior and catch a future over-zealous sanitizer. Worth one test; `innerHTML` is advertised in the design doc as a trust-the-caller API and the docs will link to DOMPurify — pinning the "we do not sanitize" contract is valuable.

#### Nit 2 — `toVNode` relative import is non-ideal

`import { toVNode } from '../dom-shim'` (line 16) reaches into `src/`. Consistent with sibling tests in the same directory, but non-ideal vs. the phase plan's "no relative imports into `src/`" rule. Either promote `toVNode` to the `@vertz/ui-server` barrel (it is already advertised in `dom-shim/index.ts:307` with a jsdoc) or add a test-only entrypoint. Pre-existing pattern, not introduced by this commit — file as a follow-up ticket if we want to be stricter.

#### Nit 3 — `afterEach` in `html.test.ts` swallows endHydration errors silently

`html.test.ts:8-12`:

```ts
afterEach(() => {
  try { endHydration(); } catch { /* May throw if not hydrating */ }
});
```

`endHydration()` does not, in current implementation, throw when hydration is not active — it runs the diagnostic checks (no-ops when `claimedNodes`/`hydrationRoot` are null) and resets state unconditionally. The `try/catch` is dead code today, but calling `endHydration()` on every test *after* the test's own `finally` runs does have a side-effect: if the test already called `endHydration()` once, the second call is a no-op; if the test started hydration and bailed before calling `endHydration()`, the `afterEach` does the cleanup correctly.

The real concern: `endHydration()` can emit `console.warn(…)` via `findUnclaimedNodes` if leftover state exists. That warning would fire *after* the test's own `console.warn` restore, so it goes to stdout/stderr and may cause confusion in CI logs. Low priority, but a dedicated `resetHydrationForTest()` helper (or a cleaner `isHydrating` guard inside `afterEach`) would be tidier.

#### Nit 4 — `markSubtreeClaimed` runs unconditionally in hot paths

`__html` is called once per `innerHTML` JSX attribute in compiled code; `markSubtreeClaimed` does a recursive DOM walk on every invocation. In production (`claimedNodes === null`), this is a single property read + early return. In dev mode, the cost is O(n) where n is the current number of descendants — which for a `<pre>` that is about to have its contents replaced, is typically small, but for a reactive `innerHTML` that receives a 100 KB blob, it becomes O(size of the previous render's children). Since `markSubtreeClaimed` is only needed **once** (at hydration time), not on every reactive re-render, it could be guarded by `if (!getIsHydrating() && !claimedNodes) return` instead of just `if (!claimedNodes) return`. Micro-optimization; flag, don't block.

#### Nit 5 — `markSubtreeClaimed` recurses instead of iterating

Given the existing pre-order iteration `while (child) { ...; if (child.nodeType === ELEMENT) markSubtreeClaimed(child as Element); child = child.nextSibling; }`, a deeply nested tree is limited by JS stack depth (typically > 10k frames, so not a real concern for HTML). An iterative stack-based walk would be cheap to write and would match the existing `findUnclaimedNodes` pattern for style consistency. Cosmetic.

### Pre-existing bugs found (not introduced by this phase)

- **`toVNode` not in the public `@vertz/ui-server` barrel** — `packages/ui-server/src/index.ts` does not re-export `toVNode` or the SSR DOM-shim classes even though every integration test in `packages/ui-server/src/__tests__/` relies on the relative `../dom-shim` path. This is out-of-scope for this phase's commit; worth a GitHub issue if we want test files to use only public imports as the phase plan and `.claude/rules/design-and-planning.md#integration-tests` direct. **Recommendation: file as a follow-up issue** titled "Promote `toVNode`/SSR dom-shim types to the `@vertz/ui-server` public entry (or provide a `/test-utils` subpath)."
- **`subpath-exports.test.ts > dist files exist for all subpath exports (post-build)` fails on HEAD** — pre-existing; requires the package to be built. Not caused by this phase, but worth noting for the final PR retrospective as a chronic CI friction point.
- **`@vertz/ui-auth` module-resolution load errors in `packages/ui-server/src/__tests__/` (4 files)** — identical to the `@vertz/fetch` issue flagged in Phase 2. Pre-existing dist-availability gap; a separate issue should already track this if it has not been filed.

Per the `feedback-create-issues-for-findings.md` rule, at minimum the first item above (`toVNode` barrel) should be filed as a GitHub issue before this PR merges — it is a concrete, actionable item tied to a ruleset the team enforces, and keeping it undocumented means the next integration-test author hits the same ambiguity. The other two are pre-existing platform gaps that are presumably already tracked; the PR retrospective can confirm.

## Resolution

All three Should-fix items addressed in a follow-up commit:

- **Should-fix 1** — Reactive-update step moved inside the hydrated-mount scope. Scenario 1 step 3 now mutates a signal that feeds the `__html` effect bound during hydration and asserts the hydrated `<pre>` node updates in place. Proves the deferred-effect tracking rebound correctly after `endHydration()`.
- **Should-fix 2** — Trivial `innerHTML={undefined}` client-path assertion removed. The unit test in `html.test.ts:19-22` already covers the `__html(el, () => undefined)` branch.
- **Should-fix 3** — Added a scenario that runs `compile()` on `<pre className="code" innerHTML={'<b>x</b>'} />`, asserts the emitted code contains `__html(`, asserts it does not leak `innerHTML` as an attribute, and asserts `setAttribute("class", …)` comes before `__html(` in source order (attribute ordering seam). Guarded with `describe.skipIf(!hasNativeCompiler)` consistent with other native-compiler tests in this directory.

Also addressed **Nit 1** (XSS / dangerous-markup proof): added a scenario feeding `<script>` + `onerror` attribute through SSR and hydration, asserting byte-exact SSR pass-through and structural survival on the client. Pins the "we do not sanitize" contract.

**Pre-existing `toVNode` barrel issue** filed as #2781 per `feedback-create-issues-for-findings.md`.

Final `vtz test packages/ui-server/src/__tests__/inner-html-integration.test.ts`: 4 passed, 1 skipped (native-compiler path runs in environments with the platform binary).
