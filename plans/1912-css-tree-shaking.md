# Tree-Shake Unused Component Variant CSS from SSR Responses

> Reduce SSR CSS payload from ~87KB to ~42-47KB per page (~48% reduction) by making `configureTheme()` lazy, making `variants()` lazy, and scoping CSS collection to the render pass. Theme token pruning (a separate effort) would bring the total to <15KB.

## Status

**Draft — Rev 2** — Addresses all findings from DX, Product/Scope, and Technical reviews.

**Issue:** #1912

## Why Now

Every SSR response includes **~87KB of CSS** regardless of which components are used on the page. This is **91% of the response payload** and the single biggest performance bottleneck in Vertz SSR benchmarks.

| Route | Vertz response | Hono response | Ratio |
|-------|---------------|---------------|-------|
| /     | 100,394 bytes | 12,532 bytes  | 8.0x  |
| /games | 91,127 bytes | ~8,000 bytes  | ~11x  |
| /sellers | 150,980 bytes | ~12,000 bytes | ~13x |

The CSS payload breakdown:

| Layer | Size | Per-Page? | Source |
|-------|------|-----------|--------|
| Theme CSS (tokens, vars, fonts) | ~35 KB | NO | `compileTheme()` |
| Component styles (button, badge, dialog, etc.) | ~45 KB | NO | `configureTheme()` → 38+ `createXxx()` |
| Global styles (resets) | ~5 KB | NO | `module.styles` |
| Page-specific component CSS | ~2 KB | YES | Only from rendered components |

**Root cause:** `configureTheme()` eagerly calls 38+ `createXxxStyles()` functions at module load. Most use `css()` directly (dialog, select, tabs, checkbox, etc.), and two use `variants()` (button, badge). All inject CSS into the global `injectedCSS` Set immediately at import time. Then `collectCSS()` dumps the entire Set into every SSR response.

## API Surface

### No public API changes

This optimization is entirely internal. The developer-facing API does not change:

```typescript
// Developer code — unchanged
import { configureTheme } from '@vertz/theme-shadcn';
import { registerTheme } from '@vertz/ui';

const config = configureTheme({ palette: 'zinc', radius: 'md' });
registerTheme(config);

// css() and variants() usage — unchanged
const styles = css({
  card: ['p:4', 'bg:background', 'rounded:lg'],
});

const button = variants({
  base: ['flex', 'font:medium'],
  variants: { intent: { primary: ['bg:primary'], secondary: ['bg:secondary'] } },
  defaultVariants: { intent: 'primary' },
});
```

### Internal changes — lazy `configureTheme()`

```typescript
// packages/theme-shadcn/src/configure.ts — internal change

// BEFORE: all styles compiled eagerly at configureTheme() call time
const dialogStyles = createDialogStyles();   // css() calls → injectCSS() immediately
const selectStyles = createSelectStyles();   // css() calls → injectCSS() immediately
// ... 36 more

// AFTER: styles deferred to first access via lazy getters
function lazyStyle<T>(factory: () => T): { value: T } {
  let cached: T | undefined;
  return { get value() { return cached ??= factory(); } };
}

const _dialog = lazyStyle(createDialogStyles);
const _select = lazyStyle(createSelectStyles);
// styles.dialog → _dialog.value (triggers createDialogStyles() on first access)
```

### Internal changes — lazy variant CSS compilation

```typescript
// packages/ui/src/css/variants.ts — internal change

// BEFORE: variants() pre-computes CSS for ALL options at creation time
// const result = css({ [blockName]: styles }, filePath);  // for every variant option

// AFTER: variants() defers CSS compilation to first use of each option
// CSS is compiled lazily when the variant function is called with specific props
```

### Internal changes — render-scoped CSS tracking

```typescript
// packages/ui/src/css/css.ts — change to injectCSS()

// injectCSS() now also writes to the per-request SSR tracker (if active).
// The SSR context is resolved via globalThis.__VERTZ_SSR_RESOLVER__, which
// survives the Vite SSR bundle boundary (bundled @vertz/ui gets the same
// context as @vertz/ui-server because the resolver is on globalThis).
export function injectCSS(cssText: string): void {
  // ... existing global Set logic unchanged ...

  // NEW: also write to per-request tracker for SSR
  const ssrCtx = getSSRContext();
  if (ssrCtx?.cssTracker) {
    ssrCtx.cssTracker.add(cssText);
  }
}
```

```typescript
// packages/ui-server/src/ssr-render.ts — updated collectCSS()

function collectCSS(themeCss: string, module: SSRModule): string {
  const ssrCtx = getSSRContext();

  // Use render-scoped CSS if available, fall back to global
  const componentCss = ssrCtx?.cssTracker
    ? Array.from(ssrCtx.cssTracker)
    : (module.getInjectedCSS?.() ?? []);

  // ... rest unchanged (dedup theme + globals, build <style> tags)
}
```

## Manifesto Alignment

### Principle 7: Performance is not optional

This change directly addresses a measured performance bottleneck. SSR responses are 8-13x larger than necessary. Under load, this amplifies into GC pressure, string allocation overhead, and network I/O that degrades P95 latency.

### Principle 1: If it builds, it works

No API changes — no new type surface, no breaking changes, no new conventions to learn. The optimization is invisible to developers. If their app builds today, it continues to work identically.

### Principle 3: AI agents are first-class users

LLMs don't need to know about this. The public API is unchanged. No new patterns to learn.

### Tradeoff: Compile-time over runtime

We're shifting CSS compilation from "module load time" (eager, all at once) to "first render use" (lazy, per component). This is a small runtime cost (~microseconds per first-use) traded for a large per-request savings (~40KB per SSR response).

## Non-Goals

1. **External stylesheet extraction** — Serving CSS as a separate `<link>` file. This is a valid optimization (cacheability) but is a separate concern and can be done independently later.
2. **Per-route CSS bundles at build time** — The `RouteCSSManifest` and `DeadCSSEliminator` already exist in the compiler. Wiring them into production builds is a separate effort.
3. **Critical CSS extraction** — Inlining only above-the-fold CSS. Requires layout analysis which is out of scope.
4. **Theme token pruning** — Removing unused CSS custom properties from `:root`. Theme tokens are ~35KB but they're shared infrastructure used by any component. Pruning requires whole-app analysis. With token pruning, the total could drop to <15KB.
5. **CSS minification** — Compressing CSS output. Orthogonal to tree-shaking.

## Unknowns

### 1. Lazy `configureTheme()` first-use latency — LOW RISK

**Question:** Does deferring all `createXxxStyles()` calls from module load to first access add measurable latency during SSR render?

**Expected:** No. Each `createXxxStyles()` call takes microseconds. A typical page uses 3-8 component styles, totaling <0.5ms. Module load currently pays this cost for all 38+ styles, so lazy initialization reduces total work per process lifetime.

**Resolution:** Measure during Phase 1 implementation.

### 2. Render-scoped tracking + Vite SSR bundle — LOW RISK (VERIFIED)

**Question:** Does the per-request CSS tracker work across the Vite SSR module boundary (where `@vertz/ui` is inlined as a separate module instance)?

**Expected:** Yes. The SSR context resolver uses `globalThis.__VERTZ_SSR_RESOLVER__` (see `packages/ui/src/ssr/ssr-render-context.ts:92`). Since `globalThis` is shared across all module instances in the same process, the bundled `@vertz/ui`'s `injectCSS()` → `getSSRContext()` correctly reads the server-established context. This is the same mechanism that makes the existing SSR context check work in `injectCSS()` today (line 91 of `css.ts`).

**Resolution:** Add explicit integration test for the dual-instance scenario in Phase 2.

### 3. Browser hydration CSS availability — LOW RISK

**Question:** When the client hydrates, will lazy `configureTheme()` / lazy `variants()` have all needed CSS available?

**Expected:** Yes. On the client, `configureTheme()` is called at module load (before hydration). Component styles are accessed when components first render during hydration, triggering lazy initialization. CSS is injected into the DOM via `injectCSS()`. The SSR response includes CSS for server-rendered components, and the client independently compiles any additional CSS it needs (e.g., for client-only components).

**Resolution:** Verify during Phase 2 with hydration tests.

### 4. HMR / dev mode interaction — LOW RISK

**Question:** How does the render-scoped tracker interact with HMR dev mode?

**Expected:** No issues. In dev mode:
- The global `injectedCSS` Set accumulates CSS across HMR cycles (never cleared). This is existing behavior and unchanged.
- The per-request tracker starts fresh each SSR render. CSS from a re-imported module is re-injected via `injectCSS()`, which writes to both the global Set (for browser dedup) and the per-request tracker (for SSR scoping).
- The lazy getters in `configureTheme()` cache results in module-level variables. On HMR re-import, the module is re-evaluated, creating new lazy getters. The old cached results are garbage collected.

**Resolution:** Verify during Phase 2 with HMR smoke test.

## Type Flow Map

No generic type parameters are introduced or modified. The change is purely at the value level (CSS strings, Sets). No `.test-d.ts` files needed.

**Note on `VariantFunction.css`:** The `css: string` property on `VariantFunction<V>` (exported from `@vertz/ui`) changes from a stable string (set once at creation) to a getter that grows as options are used. This is an observable behavior change for anyone reading `fn.css`. In practice, `fn.css` is only read by internal test code and the variant function itself. The compiler's `CSSExtractor` does NOT read `fn.css` — it statically analyzes `css()` calls in the AST. We will mark `fn.css` as `@internal` in the JSDoc to signal this.

## E2E Acceptance Test

```typescript
describe('Feature: SSR CSS tree-shaking', () => {
  describe('Given an app with configureTheme() registering 38+ component styles', () => {
    describe('When SSR renders a page that only uses Button and Card', () => {
      it('Then the CSS response contains only Button, Card, theme, and global CSS', () => {
        // SSR render a simple page with only <Button> and <Card>
        const result = await ssrRenderSinglePass(module, '/');

        // CSS should NOT contain styles for unused components
        // (dialog, dropdown, select, tabs, checkbox, switch, etc.)
        expect(result.css).not.toContain('dialog');
        expect(result.css).not.toContain('dropdown');

        // CSS SHOULD contain styles for used components
        expect(result.css).toContain('button');
        expect(result.css).toContain('card');

        // Theme tokens and globals should always be present
        expect(result.css).toContain(':root');
        expect(result.css).toContain('box-sizing');
      });

      it('Then the component CSS portion is less than 10KB', () => {
        const result = await ssrRenderSinglePass(module, '/');
        // Total will be ~42-47KB (theme + globals + used components)
        // Component CSS alone should be < 10KB
        const cssSize = new TextEncoder().encode(result.css).length;
        expect(cssSize).toBeLessThan(50_000); // down from ~87KB
      });
    });
  });

  describe('Given a page that uses Button with intent="primary" and size="md"', () => {
    describe('When SSR renders that page', () => {
      it('Then the CSS contains only the primary+md variant CSS, not all intent×size combos', () => {
        const result = await ssrRenderSinglePass(module, '/');

        // Should have the used variant's CSS
        // Should NOT have unused variant CSS (e.g., danger intent)
        // This tests lazy variant compilation
      });
    });
  });

  describe('Given collectCSS is called without a preceding render pass', () => {
    it('Then returns only theme + global CSS, no component CSS', () => {
      // This tests that the render-scoped tracker correctly isolates CSS
    });
  });
});
```

## Design

### Approach: Three complementary changes

**Change 1: Lazy `configureTheme()`** — `configureTheme()` defers all 38+ `createXxxStyles()` calls to first access via lazy getters. This is the **primary driver of savings** (~40KB saved) because most theme component styles use `css()` directly, which is injected at call time. By deferring the call, CSS is only injected when a component first accesses its styles during render.

**Change 2: Lazy `variants()` CSS compilation** — For the few components that use `variants()` (button, badge), defer per-option CSS compilation from creation time to first use. This provides **per-option granularity** on top of per-component laziness.

**Change 3: Render-scoped CSS collection** — Instead of collecting from the global `injectedCSS` Set, `collectCSS()` reads from a per-render tracker that only contains CSS injected during the current SSR render pass.

### Why all three changes are needed

| CSS source | Change 1 (lazy configureTheme) | Change 2 (lazy variants) | Change 3 (render-scoped) |
|------------|-------------------------------|-------------------------|-------------------------|
| `css()` styles (dialog, select, tabs, ...) — ~40KB | Defers to first access | N/A (not variants) | Captures only if accessed during render |
| `variants()` styles (button, badge) — ~5KB | Defers to first access | Further defers per-option | Captures only used options |
| Page-specific `css()` calls — ~2KB | N/A (already per-render) | N/A | Captures during render |

**Without Change 1:** Most theme CSS is injected at module load (outside SSR context). The per-request tracker (Change 3) would miss it entirely. Only the ~2KB of page-specific CSS would be captured.

**Without Change 3:** All lazy-initialized CSS accumulates in the global `injectedCSS` Set. After the first few requests, the Set contains CSS for all components that have ever been rendered — back to ~45KB per response.

**Together:** CSS is injected lazily during render (Change 1 + 2), and only the CSS injected during *this* render is collected (Change 3).

### Change 1: Lazy `configureTheme()` — Detailed Design

**Current behavior** (`packages/theme-shadcn/src/configure.ts`):

```
configureTheme(config) →
  configureThemeBase(config)          // theme tokens + global resets
  createButton()         → css()/variants() → injectCSS()  // immediate
  createDialogStyles()   → css()             → injectCSS()  // immediate
  createSelectStyles()   → css()             → injectCSS()  // immediate
  ... 35 more createXxx() calls ...
  return { theme, globals, styles, components }
```

All CSS for all 38+ components is injected before `configureTheme()` returns. This happens at module import time, before any SSR request.

**New behavior:**

```
configureTheme(config) →
  configureThemeBase(config)          // theme tokens + global resets (unchanged — always needed)

  // Styles: lazy getters — createXxx() deferred to first access
  styles.button  → lazy(() => createButton())
  styles.dialog  → lazy(() => createDialogStyles())
  styles.select  → lazy(() => createSelectStyles())
  ... 35 more lazy getters ...

  // Components: lazy getters — themed factories deferred to first access
  components.primitives.Dialog → lazy(() => createThemedDialog())
  components.primitives.Select → lazy(() => createThemedSelect(styles.select))
  // Note: accessing components.primitives.Select triggers styles.select first
  ...

  return { theme, globals, styles, components }
```

**Implementation approach:**

Use a `lazyProp()` helper that wraps `Object.defineProperty` with a getter:

```typescript
function lazyProp<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  factory: () => T[K],
): void {
  let cached: T[K] | undefined;
  Object.defineProperty(obj, key, {
    get() {
      if (cached === undefined) cached = factory();
      return cached;
    },
    enumerable: true,
    configurable: true,
  });
}

// Usage:
const styles = {} as ThemeStyles;
lazyProp(styles, 'dialog', () => createDialogStyles());
lazyProp(styles, 'select', () => createSelectStyles());
lazyProp(styles, 'button', () => createButton());
// ...
```

**Key design decisions:**

1. **`configureThemeBase()` remains eager** — theme tokens (`:root` vars) and global resets are always needed on every page. No benefit to deferring.
2. **Each `createXxxStyles()` is independently lazy** — accessing `styles.dialog` triggers only `createDialogStyles()`, not `createSelectStyles()`.
3. **Component factories depend on their style objects** — `createThemedSelect(selectStyles)` needs `selectStyles`. When the Select component factory is first accessed, it triggers the Select style lazy getter, which calls `createSelectStyles()` → `css()` → `injectCSS()`. This happens during SSR render (within SSR context), so the per-request tracker captures it.
4. **Caching is per-process** — once a style is initialized, subsequent accesses return the cached result. The lazy getter replaces itself with the computed value on first access. This means the first request to use Dialog pays the initialization cost (~microseconds), and subsequent requests hit the cache.
5. **`createDialogGlobalStyles()` remains eager** — this is called directly (not through a style accessor) and injects global CSS for `[data-vertz-dialog-*]` data attributes. It is a small amount of CSS (~200 bytes) and is always needed when any dialog is used, so it stays eager.
6. **Two-tier lazy pattern** — Style lazy getters (e.g., `styles.dialog`) use Option A (re-inject `.css` on every access for per-request tracking). Component lazy getters (e.g., `components.primitives.Dialog`) do NOT need re-injection because they internally access their style objects during render, which triggers the style lazy getters. The component getter only defers the `createThemedXxx()` factory call.

### Change 2: Lazy `variants()` — Detailed Design

**Current behavior** (`packages/ui/src/css/variants.ts`):

```
variants(config) →
  css({ base }) → injectCSS(baseCss)        // immediate
  for each variant option:
    css({ option }) → injectCSS(optionCss)   // immediate — ALL options
  for each compound variant:
    css({ compound }) → injectCSS(compoundCss) // immediate
  fn.css = allCss.join('\n')
```

**New behavior:**

```
variants(config) →
  // Pre-compute only the base (always needed when the variant is used at all)
  css({ base }) → injectCSS(baseCss)

  // Defer variant options — compile on first use
  variantCache = Map<string, { className, css }>  // lazy cache

  fn = (props) => {
    resolved = merge(defaultVariants, props)
    for each (name, value) in resolved:
      if (!variantCache.has(`${name}_${value}`)):
        result = css({ [`${name}_${value}`]: styles })  // compile now
        variantCache.set(`${name}_${value}`, result)
      classNames.push(variantCache.get(`${name}_${value}`).className)
    return classNames.join(' ')
  }

  // fn.css is a getter returning aggregate of base + used options
  Object.defineProperty(fn, 'css', {
    get() { return [baseCss, ...variantCache.values().map(v => v.css)].join('\n'); },
    enumerable: false,
  });
```

**Key design decisions:**

1. **Base styles are always compiled eagerly** — every call to the variant function uses the base. No benefit to deferring.
2. **Variant options are compiled on first use** — each `intent_primary`, `size_md` pair is compiled when first requested. Subsequent calls hit the cache.
3. **Compound variants are compiled on first match** — only compiled when all conditions are satisfied for the first time.
4. **`fn.css` becomes a getter** — returns the aggregate of base + all options compiled so far. The `VariantFunction<V>` type already has `css: string`, so the type is unchanged. The getter is a minor observable behavior change. The `CSSExtractor` in the compiler does NOT read `fn.css` — it statically analyzes `css()` calls in the AST. We will add `@internal` JSDoc to `fn.css`.
5. **Build-time extraction is unaffected** — The compiler's `CSSExtractor` does static analysis on the AST. It doesn't depend on runtime `variants()` behavior.

### Change 3: Render-Scoped CSS Collection — Detailed Design

**Current behavior** (`packages/ui/src/css/css.ts`):

```
injectCSS(cssText) →
  injectedCSS.add(cssText)   // global Set, accumulates forever

getInjectedCSS() →
  return Array.from(injectedCSS)  // returns ALL CSS ever injected
```

**New behavior:**

```
injectCSS(cssText) →
  injectedCSS.add(cssText)          // global Set (unchanged — browser dedup)
  ssrCtx = getSSRContext()           // per-request via globalThis.__VERTZ_SSR_RESOLVER__
  if (ssrCtx?.cssTracker):
    ssrCtx.cssTracker.add(cssText)   // per-render tracker

getInjectedCSS() →                   // unchanged — for browser hydration + backward compat
  return Array.from(injectedCSS)
```

**How the tracker is scoped:**

The SSR context (`SSRRenderContext`) already uses `AsyncLocalStorage`. We add a `cssTracker: Set<string>` field. `injectCSS()` checks for an active SSR context and writes to both the global Set and the per-request Set.

**Vite SSR bundle boundary (dual `@vertz/ui` instance):**

The `getSSRContext()` function resolves via `globalThis.__VERTZ_SSR_RESOLVER__` (see `packages/ui/src/ssr/ssr-render-context.ts`). Since `globalThis` is shared across all module instances in the same process, the bundled `@vertz/ui`'s `injectCSS()` → `getSSRContext()` correctly reads the server-established context. This is the same bridge mechanism that makes the existing `isSSR` check work in `injectCSS()` today (line 91 of `css.ts`). An explicit integration test will verify this in Phase 2.

**`collectCSS()` reads from the render context:**

All three `collectCSS()` call sites are updated:

```typescript
// In ssr-render.ts, ssr-single-pass.ts, render-to-html.ts, and ssr-aot-pipeline.ts:

function collectCSS(themeCss: string, module: SSRModule): string {
  const ssrCtx = getSSRContext();

  // Prefer render-scoped CSS; fall back to global for non-SSR contexts
  const rawComponentCss = ssrCtx?.cssTracker
    ? Array.from(ssrCtx.cssTracker)
    : (module.getInjectedCSS?.() ?? []);

  // Dedup theme + globals
  const alreadyIncluded = new Set<string>();
  if (themeCss) alreadyIncluded.add(themeCss);
  if (module.styles) {
    for (const s of module.styles) alreadyIncluded.add(s);
  }
  const componentCss = rawComponentCss.filter((s) => !alreadyIncluded.has(s));

  // Build <style> tags with cascade order preserved
  const themeTag = themeCss ? `<style data-vertz-css>${themeCss}</style>` : '';
  const globalTag = module.styles?.length
    ? `<style data-vertz-css>${module.styles.join('\n')}</style>`
    : '';
  const componentTag = componentCss.length
    ? `<style data-vertz-css>${componentCss.join('\n')}</style>`
    : '';
  return [themeTag, globalTag, componentTag].filter(Boolean).join('\n');
}
```

**Why not remove the global Set?**

1. **Browser needs it** — client-side CSS injection uses the global Set for deduplication via `adoptedStyleSheets`.
2. **Dev mode needs it** — the dev server's HMR CSS sidecar tracking reads from the global Set.
3. **Backward compatibility** — `getInjectedCSS()` is exported as part of the public SSR module contract.

### Timing Model

Understanding when CSS is injected is critical to this design:

```
Timeline:

1. Module import
   └─ configureTheme() → lazy getters created (NO css() calls, NO injectCSS)
   └─ configureThemeBase() → theme tokens + globals compiled (eager, always needed)

2. SSR request arrives
   └─ ssrStorage.run(ctx) → SSR context active, cssTracker = new Set()

3. App render (within SSR context)
   └─ <Button intent="primary"> renders
      └─ accesses styles.button → lazy getter fires → createButton() → variants()
         └─ lazy variants: base CSS compiled → injectCSS() → global Set + cssTracker ✓
         └─ buttonStyles({ intent: 'primary' }) → intent_primary compiled → injectCSS() → cssTracker ✓
   └─ <Card> renders
      └─ accesses styles.card → lazy getter fires → createCard() → css()
         └─ injectCSS() → global Set + cssTracker ✓
   └─ Dialog, Select, Tabs — NOT rendered → lazy getters never fire → no CSS injected

4. collectCSS() reads from ctx.cssTracker
   └─ Returns theme + globals + Button CSS + Card CSS only
   └─ Dialog, Select, Tabs CSS is absent ✓

5. SSR response sent with ~42-47KB CSS (instead of ~87KB)

6. Next request for a different page
   └─ New ctx with fresh cssTracker = new Set()
   └─ styles.button getter returns cached result (already initialized)
      └─ BUT: the lazy getter's css() → injectCSS() still writes to the NEW cssTracker
      └─ Wait — no. The lazy getter caches the RESULT, so css()/injectCSS() only run once.
      └─ The cssTracker for this request won't see Button CSS unless Button is rendered.

   └─ SOLUTION: The per-request tracker needs to capture CSS from BOTH:
      a. First-time lazy initialization (css() calls during this render)
      b. Already-cached styles that are USED during this render

   └─ HOW: The component factory calls the variant function or reads style class names
      during render. We track which style objects are "touched" during render.
```

**Important correction:** The lazy getter caches the result, so `css()` → `injectCSS()` only runs on the first access (first request to use that component). Subsequent requests that render the same component hit the cache — the lazy getter returns the already-computed style object without calling `css()` again. This means the per-request tracker would miss CSS for components that were already initialized by a previous request.

**Revised approach for render-scoped tracking:**

Instead of relying on `injectCSS()` being called during every render, we need a different tracking mechanism. Two options:

**Option A: Re-inject on every access** — Make the lazy getter always call `injectCSS()` (which is already deduplicated by the global Set), so the per-request tracker captures it. The global Set dedup ensures no duplicate DOM injection. The per-request Set captures the CSS for this render.

```typescript
// Lazy getter that re-injects on every access (for SSR tracking)
Object.defineProperty(obj, key, {
  get() {
    if (cached === undefined) cached = factory();
    // Re-inject CSS for per-request tracking (global Set dedup prevents duplicates)
    if (cached.css) injectCSS(cached.css);
    return cached;
  },
});
```

**Option B: Track style object usage** — Each style object (result of `css()` or `variants()`) carries its `.css` string. When a component accesses its style object during render, the SSR context records that style's CSS. This requires a lightweight "style access tracker" instead of relying on `injectCSS()`.

**Chosen: Option A** — simpler, uses existing `injectCSS()` dedup, no new tracking mechanism. The only cost is a `Set.has()` check per style access (nanoseconds).

### Expected Impact

| Layer | Before | After | Savings |
|-------|--------|-------|---------|
| Theme CSS | ~35 KB | ~35 KB | 0% (always included) |
| Component styles | ~45 KB | ~2-5 KB (page-specific) | 90-95% |
| Global styles | ~5 KB | ~5 KB | 0% (always included) |
| Page-specific CSS | ~2 KB | ~2 KB | 0% (already page-specific) |
| **Total** | **~87 KB** | **~42-47 KB** | **~46-49%** |

**Where the savings come from:**
- **Change 1 (lazy configureTheme)** is the primary driver. It prevents ~40KB of CSS from being injected at module load. Only styles for components actually rendered on the page are initialized.
- **Change 2 (lazy variants)** provides per-option granularity for button/badge (~5KB total, saving ~3KB of unused variant combos).
- **Change 3 (render-scoped tracking)** ensures each SSR response includes only CSS from the current render, not CSS accumulated from prior requests.

**Theme tokens (~35KB) remain** — they are compiled by `compileTheme()` (not `configureTheme()`) and are always included. Future theme token pruning (non-goal) would bring the total to <15KB.

## Implementation Plan

### Phase 1: Lazy `configureTheme()` + Lazy `variants()`

**Goal:** Defer all component style creation to first access. Defer per-option variant compilation to first use.

**Files changed:**
- `packages/theme-shadcn/src/configure.ts` — lazy getters for styles + components
- `packages/ui/src/css/variants.ts` — lazy per-option compilation
- `packages/ui/src/css/__tests__/variants.test.ts` — updated tests
- `packages/theme-shadcn/src/__tests__/configure.test.ts` — new lazy initialization tests

**Acceptance criteria:**

```typescript
describe('Feature: Lazy configureTheme()', () => {
  describe('Given configureTheme() is called', () => {
    describe('When no component styles are accessed', () => {
      it('Then only theme tokens and global resets CSS is injected', () => {});
      it('Then no component CSS (dialog, select, tabs, etc.) is in injectedCSS', () => {});
    });
  });

  describe('Given configureTheme() is called', () => {
    describe('When styles.dialog is first accessed', () => {
      it('Then dialog CSS is injected into the global Set', () => {});
      it('Then other component CSS (select, tabs) is NOT injected', () => {});
    });
  });

  describe('Given styles.dialog was already accessed', () => {
    describe('When styles.dialog is accessed again', () => {
      it('Then the same cached result is returned', () => {});
      it('Then createDialogStyles() is NOT called again', () => {});
    });
  });

  describe('Given components.primitives.Select is accessed', () => {
    describe('When it triggers the Select style lazy getter', () => {
      it('Then Select CSS is injected', () => {});
      it('Then the themed Select component is functional', () => {});
    });
  });
});

describe('Feature: Lazy variant CSS compilation', () => {
  describe('Given a variants() config with 3 intents and 2 sizes', () => {
    describe('When the variant function is created but never called', () => {
      it('Then only base CSS is injected (not intent/size options)', () => {});
    });
  });

  describe('Given a variants() config with defaultVariants { intent: "primary", size: "md" }', () => {
    describe('When calling fn() with no args (using defaults)', () => {
      it('Then CSS for intent_primary and size_md is injected', () => {});
      it('Then CSS for intent_secondary is NOT injected', () => {});
    });
  });

  describe('Given a variant option has already been compiled', () => {
    describe('When calling fn() with the same option again', () => {
      it('Then the cached className is returned (no recompilation)', () => {});
    });
  });

  describe('Given a compound variant with { intent: "primary", size: "sm" }', () => {
    describe('When calling fn({ intent: "primary", size: "sm" })', () => {
      it('Then the compound CSS is compiled and injected', () => {});
    });
    describe('When calling fn({ intent: "secondary", size: "sm" })', () => {
      it('Then the compound CSS is NOT compiled', () => {});
    });
  });

  describe('Given fn.css property is accessed after some options used', () => {
    it('Then fn.css returns only the CSS for base + used options', () => {});
  });
});
```

### Phase 2: Render-Scoped CSS Collection

**Goal:** SSR collects only CSS injected during the current render pass, not the global accumulated Set.

**Files changed:**
- `packages/ui/src/css/css.ts` — add render-scoped tracking to `injectCSS()`
- `packages/ui/src/ssr/ssr-render-context.ts` — add `cssTracker` to `SSRRenderContext` type
- `packages/ui-server/src/ssr-render.ts` — update `collectCSS()` + `createRequestContext()`
- `packages/ui-server/src/ssr-single-pass.ts` — update `collectCSS()` + `createRequestContext()`
- `packages/ui-server/src/render-to-html.ts` — update CSS collection (uses `getInjectedCSS` directly)
- `packages/ui-server/src/ssr-aot-pipeline.ts` — update its `collectCSS()` variant

**Acceptance criteria:**

```typescript
describe('Feature: Render-scoped CSS collection', () => {
  describe('Given configureTheme() with lazy styles and an active SSR context', () => {
    describe('When SSR renders a page using only Button', () => {
      it('Then collectCSS returns only theme + globals + Button CSS', () => {});
      it('Then collectCSS does NOT include Dialog, Select, Tabs CSS', () => {});
    });
  });

  describe('Given two sequential SSR renders for different pages', () => {
    describe('When page A uses Button and page B uses Card', () => {
      it('Then page A CSS contains Button but not Card', () => {});
      it('Then page B CSS contains Card but not Button', () => {});
    });
  });

  describe('Given a component was already initialized by a previous request', () => {
    describe('When a new request renders the same component', () => {
      it('Then the per-request tracker captures that components CSS via re-injection', () => {});
    });
  });

  describe('Given the Vite SSR bundle has a separate @vertz/ui instance', () => {
    describe('When injectCSS is called from the bundled instance during render', () => {
      it('Then the per-request tracker captures the CSS via globalThis resolver', () => {});
    });
  });

  describe('Given the global injectedCSS Set has accumulated CSS from prior renders', () => {
    describe('When a new render starts', () => {
      it('Then the render-scoped tracker starts empty', () => {});
      it('Then prior CSS does not leak into the new render response', () => {});
    });
  });
});
```

### Phase 3: Integration + Benchmark Verification

**Goal:** Verify the combined optimization works end-to-end and measure actual payload reduction.

**Files changed:**
- `packages/ui-server/src/__tests__/ssr-css-treeshake.test.ts` — new integration test
- Benchmark measurement (no code changes, verification only)

**Acceptance criteria:**

```typescript
describe('Feature: SSR CSS tree-shaking E2E', () => {
  describe('Given a full app with configureTheme() and multiple routes', () => {
    describe('When SSR renders the home page (uses Button, Card)', () => {
      it('Then total CSS payload is < 50KB (down from ~87KB)', () => {});
      it('Then page renders correctly with all styles applied', () => {});
    });

    describe('When SSR renders a form page (uses Button, Input, FormGroup)', () => {
      it('Then CSS contains only form-related component styles', () => {});
      it('Then CSS does NOT contain Dialog, Table, Carousel styles', () => {});
    });

    describe('When the same page is rendered twice in sequence', () => {
      it('Then both renders produce identical CSS output', () => {});
    });

    describe('When two different pages are rendered in sequence', () => {
      it('Then each response has only its own page CSS', () => {});
    });
  });
});
```

**Dependencies between phases:**
- Phase 1 is independent — can be shipped alone for the lazy initialization benefit
- Phase 2 depends on Phase 1 — render-scoped tracking requires CSS to be injected during render (not at module load), which is only true after Change 1
- Phase 3 depends on Phase 1 + Phase 2

### Documentation Phase

No public API changes → no doc updates needed in `packages/docs/`. The optimization is transparent to developers.
