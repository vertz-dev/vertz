# Phase 1: Runtime Foundations

## Context

Feature #2761 adds an `innerHTML` JSX prop to all non-void intrinsic HTML elements. Phase 1 lands the runtime/type pieces that the compiler (Phase 2) and migrations (Phase 4) depend on. No compiler work yet.

**Design doc:** `plans/2761-raw-html-injection.md`

Deliverables for this phase:
- `TrustedHTML` branded type + `trusted()` helper.
- `__html(el, fn)` runtime helper wrapping `deferredDomEffect`.
- JSX type surface: `HTMLAttributes.innerHTML?: string | TrustedHTML`, `VoidHTMLAttributes = Omit<HTMLAttributes, 'innerHTML' | 'children'>`, void-element interface overrides.
- JSX dev/test runtime branch that honors `innerHTML` and throws when `children` is also present.

Every task is strict TDD. Green = `vtz test && vtz run typecheck && vtz run lint` all pass on the changed packages.

---

## Task 1.1: `TrustedHTML` type + `trusted()` helper

**Files:** (3)
- `packages/ui/src/trusted-html.ts` (new)
- `packages/ui/src/__tests__/trusted-html.test-d.ts` (new — type-level tests)
- `packages/ui/src/index.ts` (modified — add barrel export)

**What to implement:**

```ts
// packages/ui/src/trusted-html.ts
declare const TrustedHTMLBrand: unique symbol;

/** Opaque marker for HTML strings the application has vouched for. */
export type TrustedHTML = string & { readonly [TrustedHTMLBrand]: 'TrustedHTML' };

/**
 * Mark an HTML string as safe to pass to `innerHTML`. The caller is
 * responsible for ensuring the string does not contain attacker-controlled
 * markup (e.g. by passing it through DOMPurify first).
 *
 * A future oxlint rule (`no-untrusted-innerHTML`) will flag dynamic
 * `innerHTML` values that are not `TrustedHTML`. Using `trusted()` now
 * future-proofs your code.
 *
 * @security XSS: passing attacker-controlled input enables script execution.
 */
export function trusted(html: string): TrustedHTML {
  return html as TrustedHTML;
}
```

Barrel export: add `export { trusted, type TrustedHTML } from './trusted-html';` to `packages/ui/src/index.ts` next to other public exports.

**Acceptance criteria:**
- [ ] `trusted('x')` returns a value assignable to `TrustedHTML`.
- [ ] `TrustedHTML` is assignable to `string` (so legacy APIs keep working).
- [ ] A `string` is **not** assignable to `TrustedHTML` (verified via `@ts-expect-error` in `.test-d.ts`).
- [ ] `unique symbol` brand survives `.d.ts` emit for the package (spot-check built `dist/` after `vtz run build` on `@vertz/ui`).
- [ ] `trusted` is exported from `@vertz/ui` root.

---

## Task 1.2: `__html()` runtime helper

**Files:** (3)
- `packages/ui/src/dom/html.ts` (new)
- `packages/ui/src/dom/__tests__/html.test.ts` (new)
- `packages/ui/src/dom/index.ts` (modified — add export)

**What to implement:**

```ts
// packages/ui/src/dom/html.ts
import { deferredDomEffect } from '../runtime/signal';

/**
 * Reactively assigns element.innerHTML to fn().
 * Uses deferredDomEffect so the first run is deferred until after hydration
 * completes, preserving hydration-claimed child nodes during the cursor walk.
 * Nullish values render as the empty string.
 */
export function __html(
  element: Element,
  fn: () => string | null | undefined,
): () => void {
  return deferredDomEffect(() => {
    const value = fn();
    element.innerHTML = value == null ? '' : value;
  });
}
```

Add to `packages/ui/src/dom/index.ts`:
```ts
export { __html } from './html';
```

**Acceptance criteria (TDD order — write each test red, make it green, then next):**
- [ ] `__html(el, () => '<b>x</b>')` sets `el.innerHTML` to `'<b>x</b>'` after scheduler flush.
- [ ] `__html(el, () => null)` sets `el.innerHTML` to `''`.
- [ ] `__html(el, () => undefined)` sets `el.innerHTML` to `''`.
- [ ] Calling the returned dispose function stops future updates from a reactive `fn`.
- [ ] Reactive signal changes in `fn` trigger re-assignment of `el.innerHTML` (use a signal, change it, assert new value after flush).
- [ ] `__html` is exported from `packages/ui/src/dom/index.ts`.

Reference existing helpers for the deferredDomEffect pattern: `packages/ui/src/dom/attributes.ts`, `packages/ui/src/runtime/signal.ts`.

---

## Task 1.3: JSX types + jsx-runtime branch

**Files:** (3)
- `packages/ui/src/jsx-runtime/index.ts` (modified)
- `packages/ui/src/jsx-runtime/__tests__/inner-html.test.ts` (new)
- `packages/ui/src/jsx-runtime/__tests__/inner-html.test-d.ts` (new)

**What to implement:**

### Types in `JSX` namespace

Extend `HTMLAttributes` with `innerHTML?: string | TrustedHTML`. Add `VoidHTMLAttributes = Omit<HTMLAttributes, 'innerHTML' | 'children'>`. Override `IntrinsicElements` entries for the HTML void elements (`img, br, hr, input, area, base, col, embed, link, meta, source, track, wbr`) with `VoidHTMLAttributes` (for `input`, intersect with `InputHTMLAttributes` minus `innerHTML`/`children`). Import `TrustedHTML` via `import type`.

### Runtime branch in `jsxImpl`

Extract `innerHTML` from props alongside `children` and `ref`. After other attributes are applied but before `applyChildren`:

```ts
if (innerHTML != null) {
  if (children != null) {
    throw new Error(
      `<${typeof tag === 'string' ? tag : 'Component'}> has both 'innerHTML={…}' and children. ` +
      `innerHTML replaces children — remove one.`,
    );
  }
  element.innerHTML = String(innerHTML);
} else {
  applyChildren(element, children);
}
```

Make sure `innerHTML` is **not** reprocessed by the existing `for (const [key, value] of Object.entries(attrs))` loop — destructure it out before.

### Tests (TDD order)

Runtime (`inner-html.test.ts`):
- [ ] `<pre innerHTML="<span>a</span>" />` has `innerHTML === '<span>a</span>'` and `firstElementChild.tagName === 'SPAN'`.
- [ ] `<pre innerHTML={undefined} />` has empty `innerHTML`.
- [ ] `<pre innerHTML="x">y</pre>` throws with message matching `/innerHTML={…}.+children/i`.
- [ ] `innerHTML` is not emitted as an HTML attribute (i.e. `el.getAttribute('innerHTML')` is `null`).
- [ ] Setting `innerHTML` on a `<div>` with a class + onClick still applies class and click handler.

Types (`inner-html.test-d.ts`):
- [ ] `<div innerHTML="x" />` typechecks.
- [ ] `<div innerHTML={trusted('x')} />` typechecks.
- [ ] `// @ts-expect-error` on `<div innerHTML={42} />`.
- [ ] `// @ts-expect-error` on `<img innerHTML="x" src="y" />` (void element rejects innerHTML).
- [ ] `// @ts-expect-error` on `<br innerHTML="x" />`.
- [ ] `<div innerHTML="x">child</div>` is NOT a TS error — mutual-exclusion is enforced by the compiler (Phase 2), not the type system. Document this in a comment inside the test file.

**Acceptance criteria:**
- All above runtime + type tests pass.
- `vtz run typecheck` clean on `@vertz/ui`.
- `vtz test` clean on `@vertz/ui`.

---

## Phase 1 Done When

- All three tasks' acceptance criteria are met.
- Full quality gates pass on `@vertz/ui`: `vtz test`, `vtz run typecheck`, `vtz run lint` (or `vtzx oxlint --fix` + `vtzx oxfmt` on changed files).
- One commit per task, each commit referencing `#2761`.
- Adversarial review written at `reviews/2761-raw-html-injection/phase-01-runtime-foundations.md` and all blockers addressed.
- Phase 1 changes do **not** yet alter user-facing compiled behavior — the compiler doesn't know about `innerHTML` until Phase 2. This is intentional; the runtime helpers are ready to be called.
