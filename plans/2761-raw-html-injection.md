# Raw HTML Injection in JSX (`innerHTML` prop)

**Status:** Draft (Rev 2 — addressing DX, Product, and Technical review feedback)
**Issue:** #2761
**Date:** 2026-04-17

## Revision History

- **Rev 1 (2026-04-17)** — Initial proposal: `innerHTML={string}` prop.
- **Rev 2 (2026-04-17)** — Addresses three adversarial reviews:
  - Typing: `innerHTML?: string | TrustedHTML` with a `trusted()` helper to unlock a future lint rule.
  - Compile-time diagnostics for React-style `dangerouslySetInnerHTML` and `ref`-based `el.innerHTML = …`.
  - Corrects import paths (`runtime/signal` not `dom/effect`), actual `dom/index.ts` exports, and the control-flow into `process_attr`.
  - Mutual-exclusion check relocated to the element-level transform (pre-`process_attr`).
  - Hydration: **both** static and reactive cases route through `__html()` so deferral is uniform; no synchronous `innerHTML =` during hydration.
  - In-repo callers that currently use imperative `el.innerHTML = …` migrated as part of the rollout.
  - Void-element forbidding pinned to a specific compiler check.
  - Follow-up issues explicitly listed: ref-callback bug, `no-untrusted-innerHTML` lint.

## Problem

There is currently no working way to inject raw HTML into a JSX element in Vertz. Users need this for syntax highlighting (`sugar-high`, `shiki`), sanitized user content, icon SVG strings, embeds, and the framework's own dev-only docs tooling. The user reported in #2761 that three intuitive attempts all fail silently:

```tsx
<pre innerHTML={htmlString} />                                    // renders nothing
<pre dangerouslySetInnerHTML={{ __html: htmlString }} />          // renders nothing
<code ref={(el: HTMLElement) => { el.innerHTML = htmlString; }}/> // renders nothing
```

### Why each attempt fails today

1. **`innerHTML` prop** → The JSX runtime (`packages/ui/src/jsx-runtime/index.ts:186`) treats it as a generic attribute and calls `element.setAttribute('innerHTML', str)`, which creates a bogus HTML attribute (not the DOM property). The native compiler (`native/vertz-compiler-core/src/jsx_transformer.rs:1459`) has no special case for `innerHTML`.
2. **`dangerouslySetInnerHTML`** → Same path; object is stringified to `[object Object]` and set as an attribute.
3. **`ref` callback** → Tracked as **follow-up issue #TBD-ref-callback** (filed before this PR merges). The compiler currently emits `el.current = ref` for *all* ref props, assuming a `RefObject`, so callback refs aren't invoked. Even with that bug fixed, ref-based `innerHTML` still loses on three counts: (a) no SSR output (refs are client-only), (b) no reactivity, (c) silently clobbers children.

Existing in-repo imperative callers confirm the pain — today the framework's own code falls back to imperative `el.innerHTML = …`:

- `packages/ui/src/component/foreign.ts:86`
- `packages/component-docs/src/components/code-block.tsx:63` (the exact sugar-high use case from the issue)
- `packages/ui-auth/src/oauth-button.tsx:32`
- `packages/icons/src/render-icon.ts:15`

The SSR dom-shim (`packages/ui-server/src/dom-shim/ssr-element.ts:304`) already implements `innerHTML` property semantics and emits trusted markup via `rawHtml()` during serialization — but no compiled JSX path reaches it.

**After this change:** `<pre innerHTML={htmlString} />` works on SSR, hydration, and CSR; reactive string signals drive re-renders; a compile-time error prevents combining `innerHTML` with children; React-style `dangerouslySetInnerHTML` produces a helpful compiler error redirecting to the supported prop; the four in-repo imperative callers are migrated.

## Design Goals

1. **One obvious way.** One prop, DOM-native name. Any JS dev (or LLM) recognizes `innerHTML` as raw HTML.
2. **SSR / hydration / CSR parity** from the same JSX.
3. **Reactive** string expressions drive updates via the existing signal scheduler; no manual effect plumbing.
4. **Mutually exclusive with children** at compile time. The error message is actionable.
5. **Trusted-value type scaffolding** — `TrustedHTML` branded type + `trusted(str)` helper. `innerHTML` accepts `string | TrustedHTML`. This unlocks a future `no-untrusted-innerHTML` oxlint rule without an API break.
6. **React-migrant compiler diagnostic.** `dangerouslySetInnerHTML={...}` and direct `ref` → `el.innerHTML =` patterns emit a diagnostic pointing to the supported prop.
7. **Dogfood.** Four in-repo imperative callers migrated in the same feature.

## API Surface

### Public API

A new prop `innerHTML?: string | TrustedHTML` on every non-void intrinsic HTML element. Mutually exclusive with `children` (enforced at compile time).

```tsx
import { highlight } from 'sugar-high';
import { trusted } from '@vertz/ui';

// Static string literal — compiler treats as trusted
function CodeBlock({ code }: { code: string }) {
  return <pre className={styles.code} innerHTML={highlight(code)} />;
}

// Reactive / dynamic string
function LiveHighlight() {
  let code = 'const x = 1;';
  const html = highlight(code); // compiler auto-wraps as computed() per UI rules
  return (
    <>
      <textarea onInput={(e) => { code = (e.target as HTMLTextAreaElement).value; }} />
      <pre innerHTML={html} />
    </>
  );
}

// Recommended pattern for user-controlled input: sanitize, then wrap
import DOMPurify from 'isomorphic-dompurify';
<article innerHTML={trusted(DOMPurify.sanitize(user.bio))} />
```

### `trusted()` helper

```ts
// packages/ui/src/trusted-html.ts
declare const brand: unique symbol;

/** Opaque marker for HTML strings the application has vouched for. */
export type TrustedHTML = string & { readonly [brand]: 'TrustedHTML' };

/**
 * Mark an HTML string as safe for `innerHTML`. The caller is responsible for
 * ensuring the value does not contain attacker-controlled markup.
 *
 * A future oxlint rule (`no-untrusted-innerHTML`) will flag dynamic `innerHTML`
 * values that are NOT of type `TrustedHTML`. Opt-in now to avoid later churn.
 */
export function trusted(html: string): TrustedHTML {
  return html as TrustedHTML;
}
```

Exported from `@vertz/ui` barrel so users import `{ trusted }` directly.

### Compile-time diagnostics

Three explicit diagnostics emitted by the native compiler:

1. **`innerHTML` + children on the same element** →
   `error[E0761]: <pre> has both 'innerHTML={…}' and JSX children. innerHTML replaces all children — delete the children, or delete innerHTML and use JSX instead.`
2. **`dangerouslySetInnerHTML={…}`** (attribute name match, any element) →
   `error[E0762]: 'dangerouslySetInnerHTML' is a React prop. Vertz uses 'innerHTML={string}' directly. Pass the string value, not { __html: … }.`
3. **Callback-ref assigning innerHTML** (pattern: `ref={(el) => { el.innerHTML = X }}` where the ref target is the current element) →
   `warning[W0763]: Setting .innerHTML inside a ref callback does not render during SSR and isn't reactive. Use 'innerHTML={…}' instead.`
   Warning (not error) because false positives on arbitrary ref bodies are possible; warning is enough to guide the user.

All three can be suppressed via `@vertz-ignore <code>` comment for the rare legitimate case, mirroring existing compiler diagnostics.

### Type surface

In `packages/ui/src/jsx-runtime/index.ts`, `JSX.HTMLAttributes` gains one optional field:

```ts
import type { TrustedHTML } from '../trusted-html';

export interface HTMLAttributes {
  [key: string]: unknown;
  children?: unknown;
  className?: string;
  style?: string | CSSProperties;
  /**
   * Sets the element's raw HTML content (DOM `innerHTML` property).
   * Inserted WITHOUT escaping — never pass attacker-controlled input
   * unless you have sanitized it (e.g., `DOMPurify.sanitize(...)`)
   * and wrapped the result with `trusted(...)`.
   *
   * Mutually exclusive with `children` (compile error if both are set).
   *
   * @see https://vertz.dev/docs/jsx/innerhtml
   * @security XSS: attacker-controlled HTML in this prop enables script execution.
   */
  innerHTML?: string | TrustedHTML;
}
```

**Void elements** (`img`, `br`, `hr`, `input`, `area`, `base`, `col`, `embed`, `link`, `meta`, `source`, `track`, `wbr`) get interfaces that *omit* `innerHTML`:

```ts
export type VoidHTMLAttributes = Omit<HTMLAttributes, 'innerHTML' | 'children'>;

export interface IntrinsicElements {
  form: FormHTMLAttributes;
  input: InputHTMLAttributes & VoidHTMLAttributes; // narrower
  img: VoidHTMLAttributes;
  br: VoidHTMLAttributes;
  // ... other void elements
  [key: string]: HTMLAttributes | undefined;
}
```

The `children` + `innerHTML` mutual-exclusion is **not** expressed in the type (would require making every intrinsic element a discriminated union — prohibitive) but is caught at compile time via the compiler diagnostic in the element-level transform, *before* `process_attr` runs. IDE autocomplete will still suggest both fields; the compiler error fires at build time.

### Compiler output

`innerHTML` is recognized in the **element-level transform** (the caller of `process_attr`), *before* the per-attribute dispatch, so it:
- checks for sibling children (mutual-exclusion error),
- bypasses both the `__attr()` fallthrough and the `is_idl_property()` check,
- emits the same `__html()` call in **both static and reactive cases** (for hydration uniformity).

```ts
// Static:
<pre innerHTML="<span>hi</span>" />
// emits:
const _el = __element('pre');
__html(_el, () => '<span>hi</span>');

// Reactive:
<pre innerHTML={highlighted} />
// emits:
const _el = __element('pre');
__html(_el, () => highlighted);

// Error: innerHTML + children (compiler E0761)
<pre innerHTML={x}>y</pre>

// Error: React migrant (compiler E0762)
<pre dangerouslySetInnerHTML={{ __html: x }} />

// Warning: imperative ref (compiler W0763)
<pre ref={(el) => { el.innerHTML = x; }} />
```

Emitting `__html()` for **both** paths dodges the hydration race described in the Technical Review: the static case would otherwise call `el.innerHTML = …` synchronously during the hydration walk and destroy claimed child nodes. Routing through `__html()` (which uses `deferredDomEffect`) defers the assignment until `endHydration()`.

### Runtime helper

New file `packages/ui/src/dom/html.ts`:

```ts
import { deferredDomEffect } from '../runtime/signal';

/**
 * Reactively sets element.innerHTML to fn().
 * - Uses deferredDomEffect so the first run is deferred until after hydration
 *   completes, avoiding destruction of claimed child nodes.
 * - If fn() returns null/undefined, innerHTML is set to empty string.
 * Returns a dispose function (caller: element lifecycle owner).
 */
export function __html(element: Element, fn: () => string | null | undefined): () => void {
  return deferredDomEffect(() => {
    const value = fn();
    element.innerHTML = value == null ? '' : value;
  });
}
```

Exported from `packages/ui/src/dom/index.ts`:

```ts
export { __attr, __classList, __prop, __show } from './attributes';
export { __html } from './html';   // ← new
```

### JSX runtime (test/dev path — non-compiled)

`packages/ui/src/jsx-runtime/index.ts` is the fallback used when `.tsx` files bypass the native compiler (internal `@vertz/ui` unit tests). It gains one branch in `jsxImpl`:

```ts
const { children, ref: refProp, innerHTML, ...attrs } = props || {};
// ... apply other attrs ...
if (innerHTML != null) {
  if (children != null) {
    throw new Error(
      `<${tag}> has both 'innerHTML={…}' and children. innerHTML replaces children — ` +
      `remove one.`,
    );
  }
  element.innerHTML = String(innerHTML);
} else {
  applyChildren(element, children);
}
```

This is **not dead code**: the compiled pipeline catches the error at build time, but the test/dev JSX runtime runs without the compiler. Both enforcements are needed.

### SSR path

No changes. `packages/ui-server/src/dom-shim/ssr-element.ts:304` already:
- Stores the string on the dom-shim element
- Clears children on assignment
- Emits the string as `rawHtml()` (unescaped) during `toVNode()` serialization

`rawHtml()` is exported from `@vertz/ui-server` (`packages/ui-server/src/index.ts:120`) and the render pipeline already renders its markers un-escaped. Confirmed via `packages/ui-server/src/dom-shim/__tests__/dom-shim.test.ts:666-717`.

### Hydration path

By routing *all* `innerHTML` emission through `__html()`, the first evaluation is deferred until `endHydration()`. During the hydration cursor walk, children claimed inside the `<pre>` element are left alone; once hydration ends, `__html()` re-evaluates and sets `el.innerHTML = value`. Because the server rendered the same string, the observable output is unchanged. The cost is one re-parse of the HTML string at hydration end — acceptable for typical sizes, acknowledged as a known limitation for very large blobs (see Non-Goals).

### SVG elements

SVG elements are **forbidden** from using `innerHTML` at compile time (E0764: `'innerHTML' is not supported on SVG elements; use JSX children instead.`). Rationale: `SVGElement.innerHTML` exists but has inconsistent cross-browser/shim behavior, and no real Vertz use case requests it.

## Manifesto Alignment

- **"One obvious way"** — a single prop, DOM-native name. `TrustedHTML` is scaffolding, not a second path: plain `string` still works.
- **"If it builds, it works"** — compile errors for `innerHTML + children`, `dangerouslySetInnerHTML`, and void-element use; warning for ref-based imperative path.
- **"LLM-native"** — an LLM typing `innerHTML={str}` gets the intended behavior; an LLM typing React's `dangerouslySetInnerHTML` gets a compiler error telling it exactly what to type.
- **"Type safety wins"** — `TrustedHTML` brand prepares for lint enforcement; `string` accepted for pragmatism in Rev 1.
- **"Declarative JSX"** — users never touch `document.createElement` or `el.innerHTML`. The framework's own four imperative callers are migrated to the declarative prop.

Tradeoffs accepted:
- DOM-native `innerHTML` is less scary-looking than React's `dangerouslySetInnerHTML`. We counter with a type brand (`TrustedHTML`), an explicit JSDoc security note, an XSS-focused docs page, and a migration-inviting compiler diagnostic.
- `TrustedHTML` accepts `string` at the call site (no runtime branding). This is intentional for Rev 1 — it's scaffolding. The future lint rule enforces it at the static-analysis layer.

## Non-Goals

- **Not building an HTML sanitizer.** Callers use DOMPurify, sanitize-html, or their own sanitizer. Docs recommend **`isomorphic-dompurify`** as the default.
- **Not a `<RawHtml>` component.** Extra import; doesn't centralize sanitization (sanitization is per-input, not per-render-site, so a wrapper buys nothing).
- **Not fixing the ref-callback compilation bug in this PR.** Tracked as separate follow-up issue (**to be filed before PR merge; linked from the final PR description**). Scope: make the compiler emit `ref.current = el` only for `RefObject`-shaped refs, and invoke function refs otherwise.
- **Not shipping the `no-untrusted-innerHTML` oxlint rule.** Tracked as separate follow-up issue. The `TrustedHTML` type scaffolding makes it a purely additive future change.
- **No `outerHTML` support.** Different semantics (replaces self), no demand.
- **No streaming/chunked HTML.** The full string is applied in one assignment.
- **No `innerHTML` on SVG elements.** Forbidden at compile time (E0764).
- **Not optimizing very large reactive `innerHTML` strings.** Each signal tick re-parses the full string; for ≥100 KB reactive blobs this is noticeable. Acknowledged — not optimized in Rev 1.
- **No runtime sanitization API.** Trust is a caller responsibility.

## Unknowns

1. **Does hydration deferral work for elements that appear inside a `__list()` or `__conditional()`?**
   - **Resolution:** Yes. `deferredDomEffect` is the standard primitive; all reactive attributes inside `__list`/`__conditional` already use it and work correctly. Covered by existing hydration tests; we'll add an `innerHTML` variant.

2. **What should `innerHTML={undefined}` do?**
   - **Resolution:** Render as empty (`el.innerHTML = ''`). Matches the null-safe branch in `__html()`.

3. **What if a user writes `innerHTML={42}` (non-string)?**
   - **Resolution:** TypeScript rejects it (`number` is not assignable to `string | TrustedHTML`). Runtime path stringifies via `String()` as a defensive fallback (`jsx-runtime/index.ts` test path).

4. **Does `TrustedHTML`'s `unique symbol` brand survive `.d.ts` generation into consumer packages?**
   - **Resolution:** Yes — `unique symbol` + `declare const` emits to `.d.ts` correctly; this is the standard technique used by `@vertz/db` for branded IDs. Verified by a `.test-d.ts`.

5. **Does `innerHTML={signal}` where `signal` later becomes `undefined` clear the element?**
   - **Resolution:** Yes (`__html` coerces nullish → empty string). Acceptance test covers this.

6. **Does the `ref`-callback imperative-innerHTML detection (W0763) false-positive on legitimate imperative DOM work inside a ref?**
   - **Resolution:** The detection only triggers on the exact pattern `(el) => { el.innerHTML = X }` (AST match on the function body's first expression statement being an assignment to `<refParam>.innerHTML`). Other ref bodies (including refs that set innerHTML conditionally, or inside nested statements) are not flagged. This keeps the false-positive rate near zero at the cost of a small false-negative rate — acceptable because the warning is advisory.

## POC Results

No POC required. The proposal combines three small changes against well-understood surfaces:

- JSX runtime: one destructured prop + one branch, ~10 LoC.
- Compiler: element-level mutual-exclusion check + one new branch in the element transform + two pre-`process_attr` diagnostic matchers, ~60 LoC in `jsx_transformer.rs`.
- Runtime helper: 5 LoC, same pattern as `__attr`/`__prop`.
- SSR: already works (existing dom-shim tests at `packages/ui-server/src/dom-shim/__tests__/dom-shim.test.ts:666-717`).

## Type Flow Map

```
JSX.HTMLAttributes.innerHTML: string | TrustedHTML | undefined
  │
  │ (void elements → Omit<HTMLAttributes, 'innerHTML' | 'children'>)
  ↓
Element-level transform (jsx_transformer.rs)
  ├─ rejects element if it has `innerHTML` AND children → E0761
  ├─ rejects element if attribute name is `dangerouslySetInnerHTML` → E0762
  ├─ rejects element if tag is void and attr is `innerHTML` → on type level (TS error)
  ├─ rejects element if tag is SVG → E0764
  └─ emits `__html(_el, () => <expr>)` (same code path for static + reactive)
  │
  ↓
Pattern match: ref body does `el.innerHTML = X` → W0763
  ↓
Runtime
  ├─ __html(el, fn) → deferredDomEffect(() => el.innerHTML = fn() ?? '')
  └─ SSR: el.innerHTML setter (dom-shim) stores string, toVNode() emits via rawHtml()
  ↓
Same bytes on server and client, hydration is a no-op re-parse.

trusted(): (input: string) => TrustedHTML
  │ (brand only exists at compile time; zero runtime cost)
  ↓
Used anywhere `innerHTML` accepts `string | TrustedHTML`.
Opt-in; plain `string` still works.
Future: no-untrusted-innerHTML oxlint rule consumes this.
```

No generics, no dead types. `TrustedHTML` is consumed by one prop; `trusted()` is the only producer.

## E2E Acceptance Test

```ts
describe('Feature: innerHTML prop for raw HTML injection', () => {
  describe('Given a JSX element with a static innerHTML prop', () => {
    describe('When the element is rendered (CSR)', () => {
      it('then sets element.innerHTML to the string value', () => {
        const el = <pre innerHTML="<span>hi</span>" />;
        expect(el.innerHTML).toBe('<span>hi</span>');
        expect(el.firstElementChild?.tagName).toBe('SPAN');
      });
    });
    describe('When rendered via SSR', () => {
      it('then emits raw HTML un-escaped', async () => {
        const html = await renderToString(() => <pre innerHTML="<em>raw</em>" />);
        expect(html).toContain('<pre><em>raw</em></pre>');
      });
    });
  });

  describe('Given a reactive innerHTML expression', () => {
    describe('When the underlying signal changes', () => {
      it('then element.innerHTML updates', async () => {
        let code = 'a';
        const view = <pre innerHTML={`<b>${code}</b>`} />;
        await flushEffects();
        expect(view.innerHTML).toBe('<b>a</b>');
        code = 'b';
        await flushEffects();
        expect(view.innerHTML).toBe('<b>b</b>');
      });
    });
    describe('When the signal becomes undefined', () => {
      it('then element.innerHTML is cleared', async () => {
        let html: string | undefined = '<b>x</b>';
        const view = <pre innerHTML={html} />;
        await flushEffects();
        html = undefined;
        await flushEffects();
        expect(view.innerHTML).toBe('');
      });
    });
  });

  describe('Given an element with both innerHTML and children', () => {
    it('then the compiler emits E0761', () => {
      const src = `<pre innerHTML={x}>y</pre>`;
      expect(() => compile(src)).toThrow(/E0761.*innerHTML.*children/);
    });
  });

  describe('Given dangerouslySetInnerHTML', () => {
    it('then the compiler emits E0762 pointing to innerHTML', () => {
      const src = `<pre dangerouslySetInnerHTML={{ __html: x }} />`;
      expect(() => compile(src)).toThrow(/E0762.*innerHTML=\{string\}/);
    });
  });

  describe('Given a ref body that assigns innerHTML', () => {
    it('then the compiler emits W0763', () => {
      const src = `<pre ref={(el) => { el.innerHTML = x; }} />`;
      const { warnings } = compile(src);
      expect(warnings).toContainEqual(expect.objectContaining({ code: 'W0763' }));
    });
  });

  describe('Given a void element with innerHTML', () => {
    it('then TypeScript rejects the prop', () => {
      // @ts-expect-error — <img> cannot have innerHTML
      const _ = <img innerHTML="x" src="y" />;
    });
  });

  describe('Given an SVG element with innerHTML', () => {
    it('then the compiler emits E0764', () => {
      const src = `<svg innerHTML={x} />`;
      expect(() => compile(src)).toThrow(/E0764.*SVG/);
    });
  });

  describe('Given TrustedHTML typing', () => {
    it('then trusted() produces an innerHTML-compatible value', () => {
      const safe = trusted('<b>ok</b>');
      const _ = <div innerHTML={safe} />;
      // @ts-expect-error — number is not string | TrustedHTML
      const __ = <div innerHTML={42} />;
    });
  });

  describe('Given SSR output followed by hydration', () => {
    it('then innerHTML content is preserved without flash or wasted re-parse during walk', async () => {
      const serverHtml = await renderToString(() => <pre innerHTML="<span>x</span>" />);
      const root = mountHtml(serverHtml);
      const preBeforeHydrate = root.querySelector('pre')!;
      hydrate(() => <pre innerHTML="<span>x</span>" />, root);
      expect(root.querySelector('pre')).toBe(preBeforeHydrate); // identity preserved
      expect(root.querySelector('pre')!.innerHTML).toBe('<span>x</span>');
    });
  });
});
```

Test helpers (`renderToString`, `mountHtml`, `hydrate`, `flushEffects`, `compile`) exist in `@vertz/testing` today — verified before this Rev 2 landed.

## Alternatives Considered

### A. `<RawHtml>{htmlString}</RawHtml>`
- ✅ looks explicit
- ❌ extra import, ambiguous wrapper tag, doesn't compose with `<pre>`/`<code>` where class + HTML belong on the same tag, **doesn't centralize sanitization** (sanitization is per-input not per-render-site)

### B. React `dangerouslySetInnerHTML={{ __html: str }}`
- ✅ scary-name pedagogy
- ❌ verbose, the object wrapper exists only because React needed to disambiguate from string attrs — Vertz has no such constraint. Compile-error redirect (E0762) covers discovery for React migrants.

### C. Svelte `{@html x}` sigil
- ✅ concise, well-known to Svelte users
- ❌ invents a new JSX sigil; hostile to TS tooling; inconsistent with other props

### D. Only fix the `ref` callback bug
- ✅ smallest change
- ❌ doesn't solve SSR (refs are client-only), no reactivity, clobbers children silently

**Chosen: first-class `innerHTML` prop, `TrustedHTML` type scaffolding, compiler diagnostics for React/imperative patterns.** The three-line intuition ("I want to set innerHTML, so I pass innerHTML") matches framework behavior; the type brand and diagnostics invest in safety without adding API surface to the happy path.

## Implementation Phases (high-level)

Consolidated from 5 → 4 phases after review:

1. **Phase 1 — Runtime & jsx-runtime.** Add `TrustedHTML` type, `trusted()` helper, `__html()` helper; extend `JSX.HTMLAttributes`; extend void-element interfaces; add jsx-runtime dev path with mutual-exclusion throw. Unit tests for each piece. **Files:** `packages/ui/src/trusted-html.ts` (new), `packages/ui/src/dom/html.ts` (new), `packages/ui/src/dom/index.ts`, `packages/ui/src/jsx-runtime/index.ts`, `packages/ui/src/index.ts` (+ barrel export), tests. (≤5 files per task; split into two tasks if needed.)
2. **Phase 2 — Native compiler.** Element-level mutual-exclusion check; emit `__html()` for static + reactive `innerHTML`; diagnostics E0761, E0762, W0763, E0764. **Files:** `native/vertz-compiler-core/src/jsx_transformer.rs`, tests in the same crate.
3. **Phase 3 — SSR + hydration integration tests.** Roundtrip: SSR → hydrate → reactive update. Confirms element identity preservation and no flash. **Files:** one integration test file in `packages/ui-server/src/__tests__/`.
4. **Phase 4 — Migration & docs.**
   - Migrate `packages/ui/src/component/foreign.ts`, `packages/component-docs/src/components/code-block.tsx`, `packages/ui-auth/src/oauth-button.tsx`, `packages/icons/src/render-icon.ts` from imperative `el.innerHTML =` to the new prop. Each migration in its own commit for reviewability.
   - Docs page in `packages/mint-docs/`: `innerHTML` prop, `trusted()` helper, XSS warning, `innerHTML` vs `textContent` callout, sanitizer recommendation (DOMPurify), examples for sugar-high/shiki, mutual-exclusion rule, void-element and SVG restrictions.
   - File the two follow-up issues (ref-callback compilation bug, `no-untrusted-innerHTML` lint rule) and link from the final PR description.

Per `.claude/rules/phase-implementation-plans.md`, each phase gets its own self-contained file `plans/2761-raw-html-injection/phase-NN-<slug>.md` once this design doc is approved by the user.
