# @vertz/ui -- Implementation Plan

## Overview

Complete implementation of `@vertz/ui`, a compiler-driven UI framework with fine-grained reactivity, zero-runtime CSS, SDK-aware forms and data fetching, streaming SSR with atomic hydration, a type-safe router, and headless accessible primitives.

This plan covers v1.0 (Phases 1-8), which delivers the minimum to build a real app. v1.1 (Volta, animations, feature flags) and v1.2 (gradual rollouts) are scoped in the roadmap but not detailed here -- they will receive their own implementation plans once v1.0 stabilizes.

All code is new. There is no legacy implementation.

See also:
- [UI Design Doc](./ui-design.md) -- approved design, API surface, stress tests
- [CSS Framework Exploration](../../backstage/research/explorations/native-css-framework-exploration.md) -- `css()`, `variants()`, `defineTheme()`, array shorthands
- [Codegen Impact Analysis](../../backstage/research/explorations/ui-codegen-impact-analysis.md) -- how `@vertz/codegen` unblocks Phases 3-6
- [Animations, Flags, Rollouts](../../backstage/research/explorations/ui-animations-flags-rollouts.md) -- v1.1/v1.2 scope
- [Naming Discussion](../../backstage/research/explorations/ui-naming-discussion.md) -- Volta chosen for styled layer
- [Reactive Mutations Compiler Design](../../backstage/research/explorations/reactive-mutations-compiler-design.md) -- `.push()` triggers reactivity via compile-time transform
- [Live Component Streaming](../../backstage/research/explorations/live-component-streaming-feasibility.md) -- real-time is separate project (confirmed)

---

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reactivity model | Fine-grained signals with compile-time transform | `let` = signal, `const` = computed. Components execute once. No virtual DOM, no re-execution. |
| Mutation handling | Compile-time transform, not runtime Proxy | `.push()` on `let` arrays triggers reactivity via `peek()` + `notify()`. Zero read overhead, debuggable output, no identity issues. |
| Compiler tooling | ts-morph (analysis) + MagicString (transform) | Two-pass taint analysis. Source maps preserved. Same approach as Svelte/Vue compilers. |
| JSX compilation target | Direct DOM API calls | `__element()`, `__text()`, `__attr()`, `__on()`, `__conditional()`, `__list()`. No virtual DOM diffing. |
| CSS framework | Inside `@vertz/ui`, not separate package | `css()` with array shorthand syntax is primary API. Compiler-integrated: dead CSS elimination, type-safe tokens, zero-runtime extraction. |
| CSS primary syntax | Array shorthands: `['p:4', 'bg:background']` | Appendix B of CSS exploration is authoritative. Pseudo-state prefixes inline. Object form for complex selectors. Both compose freely. |
| Theming | `defineTheme()` with raw + contextual tokens | Raw tokens (exact values) + contextual tokens (swap via CSS custom properties per theme). Light/dark via `data-theme`. |
| Forms | `form(sdkMethod)` with explicit schema (Option C first) | Start with `form(api.users.create, { schema })`. Auto-extraction via `.meta` deferred to codegen enhancement. |
| Data fetching | Thunk-based `query()` with reactive dep tracking | Cache key derived from SDK call arguments at execution time. No codegen changes needed for v1.0. Query-level cache (not entity). |
| SSR | `renderToStream()` returning ReadableStream | Out-of-order streaming with Suspense boundaries. Slot placeholder + template replacement pattern. |
| Hydration | Atomic per-component, flat boundaries | `data-v-id` markers. Three strategies: eager, lazy (IntersectionObserver, default), interaction. ~4.5KB bootstrap. |
| Router | `defineRoutes()` with typed params + parallel loaders | Template literal types for params. `@vertz/schema` for searchParams. Nested layouts with children. |
| Headless components | `@vertz/primitives` as separate package | WAI-ARIA compliant. Button, Dialog, Select, Menu, Tabs, etc. Ships in v1.0. Volta (styled) in v1.1. |
| Build toolchain | Vite plugin (`@vertz/ui-compiler`) | HMR for components + CSS. Production extraction + code splitting. Watch mode: filesystem-based coordination with codegen. |
| Package split | `@vertz/ui` (browser) + `@vertz/ui-server` (Node) + `@vertz/ui-compiler` (Vite plugin) | Clear browser/server/build boundary. Runtime ~4.5KB gzip. |
| Dependencies on codegen | Hard: SDK methods, types, schemas. Soft: `.meta` property (deferred) | `@vertz/codegen` (PR #130) is already merged. Forms and queries consume generated SDK directly. |
| Test utilities | `@vertz/ui/test` sub-export | `renderTest()`, `createTestRouter()`, `fillForm()`, `submitForm()`. MSW for SDK mocking. |

---

## Package Structure

### `@vertz/ui` (browser runtime)

```
packages/ui/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts                              # Public API barrel
│   │
│   ├── runtime/
│   │   ├── signal.ts                         # signal(), computed(), effect(), batch(), untrack()
│   │   ├── signal-types.ts                   # Signal<T>, Computed<T>, Effect types
│   │   ├── scheduler.ts                      # Batched update scheduler
│   │   ├── tracking.ts                       # Dependency tracking context
│   │   ├── disposal.ts                       # Cleanup/disposal infrastructure
│   │   └── __tests__/
│   │       ├── signal.test.ts
│   │       ├── computed.test.ts
│   │       ├── effect.test.ts
│   │       ├── batch.test.ts
│   │       ├── untrack.test.ts
│   │       ├── disposal.test.ts
│   │       └── diamond-dependency.test.ts
│   │
│   ├── dom/
│   │   ├── element.ts                        # __element(), __text(), __fragment()
│   │   ├── attributes.ts                     # __attr(), __classList(), __show()
│   │   ├── events.ts                         # __on() event binding
│   │   ├── conditional.ts                    # __conditional() for ternary JSX
│   │   ├── list.ts                           # __list() keyed reconciliation (each)
│   │   ├── insert.ts                         # DOM insertion helpers
│   │   └── __tests__/
│   │       ├── element.test.ts
│   │       ├── attributes.test.ts
│   │       ├── events.test.ts
│   │       ├── conditional.test.ts
│   │       └── list.test.ts
│   │
│   ├── component/
│   │   ├── lifecycle.ts                      # onMount(), onCleanup(), watch()
│   │   ├── context.ts                        # createContext(), useContext(), Provider
│   │   ├── refs.ts                           # ref<T>()
│   │   ├── error-boundary.ts                 # ErrorBoundary component
│   │   ├── suspense.ts                       # Suspense component
│   │   ├── children.ts                       # Children slot mechanism
│   │   └── __tests__/
│   │       ├── lifecycle.test.ts
│   │       ├── context.test.ts
│   │       ├── refs.test.ts
│   │       ├── error-boundary.test.ts
│   │       └── suspense.test.ts
│   │
│   ├── css/
│   │   ├── css.ts                            # css() API -- array shorthand + object syntax
│   │   ├── variants.ts                       # variants() API with typed variant props
│   │   ├── theme.ts                          # defineTheme() with raw + contextual tokens
│   │   ├── theme-provider.ts                 # ThemeProvider component, data-theme switching
│   │   ├── shorthand-parser.ts               # Parse 'property:value' and 'pseudo:property:value'
│   │   ├── token-resolver.ts                 # Resolve design tokens at compile time
│   │   ├── class-generator.ts                # Hash-based deterministic class names
│   │   ├── global-css.ts                     # globalCss() for resets and base styles
│   │   ├── s.ts                              # s() inline style helper
│   │   └── __tests__/
│   │       ├── css.test.ts
│   │       ├── variants.test.ts
│   │       ├── theme.test.ts
│   │       ├── shorthand-parser.test.ts
│   │       ├── token-resolver.test.ts
│   │       └── class-generator.test.ts
│   │
│   ├── form/
│   │   ├── form.ts                           # form(sdkMethod, opts?) core
│   │   ├── form-data.ts                      # formDataToObject() converter
│   │   ├── validation.ts                     # Schema validation integration
│   │   └── __tests__/
│   │       ├── form.test.ts
│   │       ├── form-data.test.ts
│   │       └── validation.test.ts
│   │
│   ├── query/
│   │   ├── query.ts                          # query() reactive data fetching
│   │   ├── cache.ts                          # Query-level cache store
│   │   ├── key-derivation.ts                 # Cache key derivation from SDK calls
│   │   └── __tests__/
│   │       ├── query.test.ts
│   │       ├── cache.test.ts
│   │       └── key-derivation.test.ts
│   │
│   ├── router/
│   │   ├── define-routes.ts                  # defineRoutes() configuration
│   │   ├── matcher.ts                        # Route matching and resolution
│   │   ├── loader.ts                         # Parallel loader execution
│   │   ├── params.ts                         # Typed params extraction
│   │   ├── search-params.ts                  # useSearchParams() with schema
│   │   ├── navigate.ts                       # router.navigate() + revalidate()
│   │   ├── link.ts                           # <Link> component
│   │   ├── outlet.ts                         # Layout children rendering
│   │   └── __tests__/
│   │       ├── define-routes.test.ts
│   │       ├── matcher.test.ts
│   │       ├── loader.test.ts
│   │       ├── params.test.ts
│   │       ├── search-params.test.ts
│   │       └── navigate.test.ts
│   │
│   ├── hydrate/
│   │   ├── hydrate.ts                        # hydrate() client entry point
│   │   ├── strategies.ts                     # eager, lazy, interaction strategies
│   │   ├── component-registry.ts             # Component ID to import map
│   │   ├── props-deserializer.ts             # Read serialized props from <script> tags
│   │   └── __tests__/
│   │       ├── hydrate.test.ts
│   │       ├── strategies.test.ts
│   │       └── props-deserializer.test.ts
│   │
│   └── test/
│       ├── render-test.ts                    # renderTest() component test helper
│       ├── queries.ts                        # findByText, queryByText, findByTestId
│       ├── interactions.ts                   # click(), type(), fillForm(), submitForm()
│       ├── test-router.ts                    # createTestRouter() for route testing
│       └── __tests__/
│           ├── render-test.test.ts
│           └── test-router.test.ts
```

### `@vertz/ui-server` (SSR runtime, Node.js only)

```
packages/ui-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── render-to-stream.ts                   # renderToStream() -> ReadableStream
│   ├── html-serializer.ts                    # Component-to-HTML serialization
│   ├── streaming.ts                          # Out-of-order streaming with Suspense
│   ├── slot-placeholder.ts                   # v-slot-N placeholder mechanism
│   ├── template-chunk.ts                     # v-tmpl-N replacement chunks
│   ├── head.ts                               # <Head> component for meta/title
│   ├── asset-pipeline.ts                     # Script/stylesheet injection
│   ├── critical-css.ts                       # Route-to-CSS mapping, critical CSS inlining
│   ├── hydration-markers.ts                  # data-v-id, data-v-key, serialized props
│   └── __tests__/
│       ├── render-to-stream.test.ts
│       ├── streaming.test.ts
│       ├── slot-placeholder.test.ts
│       ├── critical-css.test.ts
│       └── hydration-markers.test.ts
```

### `@vertz/ui-compiler` (Vite plugin, build only)

```
packages/ui-compiler/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                              # Vite plugin export
│   ├── vite-plugin.ts                        # Vite plugin integration
│   │
│   ├── analyzers/
│   │   ├── component-analyzer.ts             # Identify component functions (returns JSX)
│   │   ├── reactivity-analyzer.ts            # Two-pass taint analysis: let/const classification
│   │   ├── jsx-analyzer.ts                   # Map JSX usage to reactive dependencies
│   │   ├── mutation-analyzer.ts              # Detect .push(), property assignment, delete on let vars
│   │   └── css-analyzer.ts                   # Extract css() calls, identify static vs reactive styles
│   │
│   ├── transformers/
│   │   ├── signal-transformer.ts             # let -> signal(), with peek() + notify() for mutations
│   │   ├── computed-transformer.ts           # const deps -> computed()
│   │   ├── jsx-transformer.ts                # JSX -> DOM API calls (__element, __text, etc.)
│   │   ├── prop-transformer.ts               # Reactive prop getter wrapping, static pass-through
│   │   ├── mutation-transformer.ts           # .push() -> peek().push() + notify()
│   │   ├── css-transformer.ts                # css() extraction, token resolution, class generation
│   │   └── hydration-transformer.ts          # Component registration, data-v-id generation
│   │
│   ├── diagnostics/
│   │   ├── mutation-diagnostics.ts           # Warn on const mutations, suggest let or reassignment
│   │   ├── props-destructuring.ts            # Warn on props destructuring in component signatures
│   │   ├── css-diagnostics.ts                # Invalid tokens, magic numbers, layout-affecting animations
│   │   └── accessibility-diagnostics.ts      # Missing alt, missing for, click on non-interactive
│   │
│   ├── css-extraction/
│   │   ├── extractor.ts                      # CSS file extraction from css() calls
│   │   ├── dead-css.ts                       # Dead CSS elimination via component usage analysis
│   │   ├── route-css-manifest.ts             # Route-to-CSS mapping manifest
│   │   ├── code-splitting.ts                 # Route-level CSS code splitting
│   │   └── hmr.ts                            # CSS HMR integration for Vite dev
│   │
│   ├── type-generation/
│   │   ├── theme-types.ts                    # Generate ThemeTokens types from defineTheme()
│   │   └── css-properties.ts                 # Generate token-aware CSSProperties interface
│   │
│   └── __tests__/
│       ├── component-analyzer.test.ts
│       ├── reactivity-analyzer.test.ts
│       ├── signal-transformer.test.ts
│       ├── computed-transformer.test.ts
│       ├── jsx-transformer.test.ts
│       ├── mutation-transformer.test.ts
│       ├── prop-transformer.test.ts
│       ├── css-transformer.test.ts
│       ├── css-extraction.test.ts
│       ├── hydration-transformer.test.ts
│       ├── diagnostics.test.ts
│       └── vite-plugin.test.ts
```

### `@vertz/primitives` (headless components)

```
packages/primitives/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── utils/
│   │   ├── keyboard.ts                       # Keyboard navigation utilities
│   │   ├── focus.ts                          # Focus management (trap, return, roving)
│   │   ├── aria.ts                           # ARIA attribute helpers
│   │   └── id.ts                             # Unique ID generation
│   ├── button/
│   │   ├── button.ts
│   │   └── __tests__/button.test.ts
│   ├── dialog/
│   │   ├── dialog.ts                         # DialogRoot, DialogTrigger, DialogContent, DialogClose
│   │   └── __tests__/dialog.test.ts
│   ├── select/
│   │   ├── select.ts                         # SelectRoot, SelectTrigger, SelectContent, SelectItem
│   │   └── __tests__/select.test.ts
│   ├── menu/
│   │   ├── menu.ts                           # MenuRoot, MenuTrigger, MenuContent, MenuItem
│   │   └── __tests__/menu.test.ts
│   ├── tabs/
│   │   ├── tabs.ts                           # TabsRoot, TabsList, TabsTrigger, TabsContent
│   │   └── __tests__/tabs.test.ts
│   ├── accordion/
│   │   ├── accordion.ts
│   │   └── __tests__/accordion.test.ts
│   ├── tooltip/
│   │   ├── tooltip.ts
│   │   └── __tests__/tooltip.test.ts
│   ├── popover/
│   │   ├── popover.ts
│   │   └── __tests__/popover.test.ts
│   ├── toast/
│   │   ├── toast.ts                          # Toast with live region announcements
│   │   └── __tests__/toast.test.ts
│   ├── combobox/
│   │   ├── combobox.ts
│   │   └── __tests__/combobox.test.ts
│   ├── switch/
│   │   ├── switch.ts
│   │   └── __tests__/switch.test.ts
│   ├── checkbox/
│   │   ├── checkbox.ts
│   │   └── __tests__/checkbox.test.ts
│   ├── radio/
│   │   ├── radio.ts                          # RadioGroup, RadioItem
│   │   └── __tests__/radio.test.ts
│   ├── slider/
│   │   ├── slider.ts
│   │   └── __tests__/slider.test.ts
│   └── progress/
│       ├── progress.ts
│       └── __tests__/progress.test.ts
```

---

## Dependency Map

```
v1.0 -- Core Framework
=============================

Phase 1: Reactivity & Compiler Foundation  <-- START HERE (no dependencies)
  |
  |--> Phase 2: CSS Framework (needs Phase 1 compiler)
  |      |
  |      '--> Phase 7: @vertz/primitives (needs Phase 2 + Phase 1)
  |
  |--> Phase 3: Forms (needs Phase 1 + @vertz/codegen [AVAILABLE])
  |--> Phase 4: Data Fetching (needs Phase 1 + @vertz/codegen [AVAILABLE])
  |--> Phase 5: SSR & Hydration (needs Phase 1)
  |--> Phase 6: Router (needs Phase 1)
  |
  '--> Phase 8: Testing & DX (needs Phases 1-6)
```

**Parallelization:** Once Phase 1 is complete, Phases 2-6 can all run in parallel. Phase 7 waits on Phase 2. Phase 8 waits on all prior phases.

**Codegen dependency:** `@vertz/codegen` (PR #130) is already merged. Phases 3 and 4 consume the generated SDK, types, and schemas directly. No codegen changes are needed for v1.0 -- SDK method metadata (`.meta` property) is deferred to a post-v1.0 codegen enhancement.

---

## Phase 1: Reactivity & Compiler Foundation

**What it implements:** The core reactive runtime (`signal`, `computed`, `effect`, `batch`, `untrack`), DOM binding helpers, the compiler's taint analysis and seven transform rules, mutation interception, the component model (props, children, context, lifecycle, refs, ErrorBoundary, Suspense), and the Vite plugin skeleton.

**Blocked by:** Nothing -- this is the starting phase.
**Can parallel:** Nothing -- all other phases depend on this.
**Assigned to:** nora + ben (compiler)
**Estimate:** 128 hours (P1-1: 40h, P1-2: 56h, P1-3: 32h)

### Sub-phase 1A: Reactivity Runtime (P1-1)

**Files created:**
- `packages/ui/src/runtime/signal.ts`
- `packages/ui/src/runtime/signal-types.ts`
- `packages/ui/src/runtime/scheduler.ts`
- `packages/ui/src/runtime/tracking.ts`
- `packages/ui/src/runtime/disposal.ts`
- `packages/ui/src/dom/element.ts`
- `packages/ui/src/dom/attributes.ts`
- `packages/ui/src/dom/events.ts`
- `packages/ui/src/dom/conditional.ts`
- `packages/ui/src/dom/list.ts`
- `packages/ui/src/dom/insert.ts`
- All corresponding `__tests__/` files

**What to implement:**
- `signal<T>(initial)` -- reactive container with `.value` getter/setter, `.peek()`, `.notify()`
- `computed<T>(fn)` -- derived reactive value, lazy evaluation, diamond dependency deduplication
- `effect(fn)` -- side effect that re-runs on dependency changes
- `batch(fn)` -- group multiple signal writes, single flush
- `untrack(fn)` -- read signals without subscribing
- DOM binding helpers: `__text()`, `__element()`, `__attr()`, `__show()`, `__classList()`
- `__on()` -- event binding
- `__conditional()` -- ternary/if JSX compilation target
- `__list(signal, keyFn, renderFn)` -- keyed list reconciliation (no virtual DOM)
- Cleanup/disposal infrastructure for component unmount
- Memory leak prevention (automatic subscription cleanup)

**Integration test acceptance criteria:**

```typescript
// IT-1A-1: Signal reactivity propagates to DOM text nodes
test('signal change updates DOM text node', () => {
  const count = signal(0);
  const el = document.createElement('div');
  const textNode = __text(() => `Count: ${count.value}`);
  el.appendChild(textNode);

  expect(el.textContent).toBe('Count: 0');
  count.value = 5;
  expect(el.textContent).toBe('Count: 5');
});

// IT-1A-2: Computed values chain transitively and update DOM
test('computed chain updates DOM when root signal changes', () => {
  const price = signal(10);
  const quantity = signal(2);
  const total = computed(() => price.value * quantity.value);
  const formatted = computed(() => `$${total.value.toFixed(2)}`);

  const el = document.createElement('span');
  const textNode = __text(() => formatted.value);
  el.appendChild(textNode);

  expect(el.textContent).toBe('$20.00');
  quantity.value = 3;
  expect(el.textContent).toBe('$30.00');
});

// IT-1A-3: Diamond dependency deduplication -- computed fires once, not twice
test('diamond dependency deduplicates updates', () => {
  const a = signal(1);
  const b = computed(() => a.value * 2);
  const c = computed(() => a.value * 3);
  const d = computed(() => b.value + c.value);

  let callCount = 0;
  effect(() => { d.value; callCount++; });
  callCount = 0; // reset after initial run

  a.value = 2;
  expect(d.value).toBe(10); // 4 + 6
  expect(callCount).toBe(1); // fired once, not twice
});

// IT-1A-4: Keyed list reconciliation preserves DOM nodes on reorder
test('__list reorders DOM nodes without recreating them', () => {
  const items = signal([{ id: 1, text: 'A' }, { id: 2, text: 'B' }, { id: 3, text: 'C' }]);
  const container = document.createElement('ul');
  __list(container, items, (item) => item.id, (item) => {
    const li = document.createElement('li');
    li.textContent = item.text;
    return li;
  });

  const originalNodes = [...container.children];
  items.value = [{ id: 3, text: 'C' }, { id: 1, text: 'A' }, { id: 2, text: 'B' }];

  expect(container.children[0]).toBe(originalNodes[2]); // C moved to front, same DOM node
  expect(container.children[1]).toBe(originalNodes[0]); // A moved to middle, same DOM node
});

// IT-1A-5: batch() groups multiple writes into a single flush
test('batch groups updates into one flush', () => {
  const a = signal(1);
  const b = signal(2);
  let flushCount = 0;
  effect(() => { a.value + b.value; flushCount++; });
  flushCount = 0;

  batch(() => { a.value = 10; b.value = 20; });
  expect(flushCount).toBe(1);
});

// IT-1A-6: Disposal cleans up subscriptions on unmount
test('disposal cleans up all subscriptions', () => {
  const count = signal(0);
  let effectRuns = 0;
  const dispose = effect(() => { count.value; effectRuns++; });
  effectRuns = 0;

  count.value = 1;
  expect(effectRuns).toBe(1);

  dispose();
  count.value = 2;
  expect(effectRuns).toBe(1); // no additional run after disposal
});

// IT-1A-7: signal.notify() triggers subscribers after in-place mutation
test('signal.notify() triggers reactive updates after mutation', () => {
  const items = signal([1, 2, 3]);
  const el = document.createElement('span');
  const textNode = __text(() => items.value.length.toString());
  el.appendChild(textNode);

  expect(el.textContent).toBe('3');
  items.peek().push(4);
  items.notify();
  expect(el.textContent).toBe('4');
});
```

### Sub-phase 1B: Compiler Core (P1-2)

**Files created:**
- `packages/ui-compiler/src/index.ts`
- `packages/ui-compiler/src/vite-plugin.ts`
- `packages/ui-compiler/src/analyzers/component-analyzer.ts`
- `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts`
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts`
- `packages/ui-compiler/src/analyzers/mutation-analyzer.ts`
- `packages/ui-compiler/src/transformers/signal-transformer.ts`
- `packages/ui-compiler/src/transformers/computed-transformer.ts`
- `packages/ui-compiler/src/transformers/jsx-transformer.ts`
- `packages/ui-compiler/src/transformers/prop-transformer.ts`
- `packages/ui-compiler/src/transformers/mutation-transformer.ts`
- `packages/ui-compiler/src/diagnostics/mutation-diagnostics.ts`
- `packages/ui-compiler/src/diagnostics/props-destructuring.ts`
- All corresponding `__tests__/` files

**What to implement:**

The seven compiler rules:
1. `let` in component body + referenced in JSX -> **signal**
2. `const` whose initializer references a signal -> **computed**
3. `let { a, b } = reactiveExpr` -> **computed** per binding
4. JSX expression referencing signal/computed -> **subscription code**
5. JSX expression referencing only plain values -> **static code**
6. Prop referencing signal/computed -> **getter wrapper**
7. Prop referencing only plain values -> **plain value**

Plus:
- Component function detection (functions returning JSX)
- Two-pass taint analysis for reactive variable detection
- Mutation interception: `.push()`, `.pop()`, `.splice()`, `.sort()`, `.reverse()`, property assignment, indexed assignment, `delete`, `Object.assign()` on `let` variables -> `peek()` + `notify()`
- Mutation diagnostics on `const` variables (warning with fix suggestion)
- Props destructuring diagnostic
- Source map generation (MagicString)
- Vite plugin integration skeleton

**Integration test acceptance criteria:**

```typescript
// IT-1B-1: Counter component compiles and works end-to-end
test('compiler transforms Counter component correctly', () => {
  const input = `
    function Counter() {
      let count = 0;
      return (
        <div>
          <p>Count: {count}</p>
          <button onClick={() => count++}>+</button>
        </div>
      );
    }
  `;
  const output = compile(input);

  // Output should contain signal import and signal declaration
  expect(output).toContain('__signal');
  expect(output).not.toContain('let count');

  // Executing the compiled output should produce working DOM
  const el = evalComponent(output);
  expect(el.querySelector('p').textContent).toBe('Count: 0');
  el.querySelector('button').click();
  expect(el.querySelector('p').textContent).toBe('Count: 1');
});

// IT-1B-2: Computed chain transforms correctly
test('compiler transforms const depending on let into computed', () => {
  const input = `
    function PriceDisplay() {
      let quantity = 1;
      const total = 10 * quantity;
      const formatted = '$' + total.toFixed(2);
      return <p>{formatted}</p>;
    }
  `;
  const output = compile(input);
  expect(output).toContain('computed');

  const el = evalComponent(output);
  expect(el.textContent).toBe('$10.00');
});

// IT-1B-3: Mutation on let array triggers reactivity
test('compiler transforms .push() on let array into peek+notify', () => {
  const input = `
    function TodoList() {
      let todos = [];
      const add = () => { todos.push({ id: 1, text: 'Test' }); };
      return (
        <div>
          <button onClick={add}>Add</button>
          <span>{todos.length}</span>
        </div>
      );
    }
  `;
  const output = compile(input);
  expect(output).toContain('peek');
  expect(output).toContain('notify');

  const el = evalComponent(output);
  expect(el.querySelector('span').textContent).toBe('0');
  el.querySelector('button').click();
  expect(el.querySelector('span').textContent).toBe('1');
});

// IT-1B-4: Static JSX produces no subscriptions
test('static JSX has no reactive subscriptions', () => {
  const input = `
    function Header() {
      const title = "Hello World";
      return <h1>{title}</h1>;
    }
  `;
  const output = compile(input);
  expect(output).not.toContain('__signal');
  expect(output).not.toContain('computed');
});

// IT-1B-5: Props are wrapped as getters for reactive values, plain for static
test('reactive props become getters, static props are plain', () => {
  const input = `
    function Parent() {
      let count = 0;
      const label = "Count";
      return <Child value={count} label={label} />;
    }
  `;
  const output = compile(input);
  // value should be a getter (reactive)
  expect(output).toMatch(/get value/);
  // label should be plain string
  expect(output).toContain('label: "Count"');
});

// IT-1B-6: Mutation diagnostic emitted for const variable
test('compiler emits diagnostic for .push() on const', () => {
  const input = `
    function Broken() {
      const items = [];
      items.push('x');
      return <div>{items.length}</div>;
    }
  `;
  const { diagnostics } = compileWithDiagnostics(input);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0].code).toBe('non-reactive-mutation');
  expect(diagnostics[0].message).toContain('will not trigger DOM updates');
  expect(diagnostics[0].fix).toContain('let');
});

// IT-1B-7: Vite plugin processes .tsx files
test('Vite plugin transforms .tsx files', async () => {
  const plugin = vertzPlugin();
  const result = await plugin.transform(counterSource, 'Counter.tsx');
  expect(result.code).toContain('__signal');
  expect(result.map).toBeDefined(); // source map present
});
```

### Sub-phase 1C: Component Model (P1-3)

**Files created:**
- `packages/ui/src/component/lifecycle.ts`
- `packages/ui/src/component/context.ts`
- `packages/ui/src/component/refs.ts`
- `packages/ui/src/component/error-boundary.ts`
- `packages/ui/src/component/suspense.ts`
- `packages/ui/src/component/children.ts`
- All corresponding `__tests__/` files

**What to implement:**
- `onMount(callback)` -- runs once when component mounts
- `onCleanup(fn)` -- teardown on unmount or before re-run
- `watch(() => dep, callback)` -- watches reactive dependency, runs on change
- `createContext<T>()` and `useContext(ctx)` with Provider component
- `ref<T>()` for DOM element access
- `ErrorBoundary` component with fallback and retry
- `Suspense` component for async boundaries
- Children slot mechanism
- Props destructuring diagnostic in compiler

**Integration test acceptance criteria:**

```typescript
// IT-1C-1: onMount runs once, onCleanup runs on unmount
test('onMount fires once, onCleanup fires on dispose', () => {
  let mounted = false;
  let cleaned = false;

  function Timer() {
    onMount(() => {
      mounted = true;
      onCleanup(() => { cleaned = true; });
    });
    return <div>Timer</div>;
  }

  const { unmount } = renderTest(<Timer />);
  expect(mounted).toBe(true);
  expect(cleaned).toBe(false);
  unmount();
  expect(cleaned).toBe(true);
});

// IT-1C-2: watch() re-runs callback when dependency changes
test('watch re-runs on dependency change', () => {
  const values: number[] = [];

  function Watcher() {
    let count = signal(0);
    watch(() => count.value, (val) => values.push(val));
    return <button onClick={() => count.value++}>+</button>;
  }

  const { findByText, click } = renderTest(<Watcher />);
  expect(values).toEqual([0]); // initial run
  click(findByText('+'));
  expect(values).toEqual([0, 1]);
});

// IT-1C-3: Context flows through component tree
test('context value flows from Provider to consumer', () => {
  const ThemeCtx = createContext<string>();

  function Consumer() {
    const theme = useContext(ThemeCtx);
    return <span>{theme}</span>;
  }

  const { findByText } = renderTest(
    <ThemeCtx.Provider value="dark">
      <Consumer />
    </ThemeCtx.Provider>
  );
  expect(findByText('dark')).toBeTruthy();
});

// IT-1C-4: ErrorBoundary catches errors and renders fallback with retry
test('ErrorBoundary catches and allows retry', () => {
  let shouldThrow = true;
  function Buggy() {
    if (shouldThrow) throw new Error('Boom');
    return <div>Recovered</div>;
  }

  const { findByText, click } = renderTest(
    <ErrorBoundary fallback={(err, retry) => (
      <div><span>{err.message}</span><button onClick={retry}>Retry</button></div>
    )}>
      <Buggy />
    </ErrorBoundary>
  );

  expect(findByText('Boom')).toBeTruthy();
  shouldThrow = false;
  click(findByText('Retry'));
  expect(findByText('Recovered')).toBeTruthy();
});

// IT-1C-5: ref provides access to DOM element after mount
test('ref.current is the DOM element after mount', () => {
  function Canvas() {
    const canvasRef = ref<HTMLCanvasElement>();
    let hasCtx = false;
    onMount(() => { hasCtx = !!canvasRef.current?.getContext; });
    return <canvas ref={canvasRef} />;
  }

  renderTest(<Canvas />);
  // If onMount ran, canvasRef.current was available
});
```

---

## Phase 2: CSS Framework (Compiler-Integrated)

**What it implements:** `css()` with array shorthand and object syntax, `variants()` for typed component variants, `defineTheme()` for design tokens and theming, zero-runtime CSS extraction, critical CSS for SSR, and CSS HMR in dev mode.

**Blocked by:** Phase 1 (compiler infrastructure)
**Can parallel with:** Phases 3, 4, 5, 6 (once Phase 1 is done)
**Assigned to:** nora
**Estimate:** 128 hours (P2-1: 48h, P2-2: 24h, P2-3: 24h, P2-4: 32h)

### Sub-phase 2A: `css()` compile-time style blocks (P2-1)

**Files created:**
- `packages/ui/src/css/css.ts`
- `packages/ui/src/css/shorthand-parser.ts`
- `packages/ui/src/css/token-resolver.ts`
- `packages/ui/src/css/class-generator.ts`
- `packages/ui/src/css/global-css.ts`
- `packages/ui/src/css/s.ts`
- `packages/ui-compiler/src/analyzers/css-analyzer.ts`
- `packages/ui-compiler/src/transformers/css-transformer.ts`
- `packages/ui-compiler/src/diagnostics/css-diagnostics.ts`

**Integration test acceptance criteria:**

```typescript
// IT-2A-1: Array shorthand syntax compiles to CSS class names
test('css() with array shorthands produces scoped class names', () => {
  const input = `
    const styles = css({
      card: ['p:4', 'bg:background', 'rounded:lg', 'shadow:sm'],
    });
    function Card() { return <div class={styles.card}>Hello</div>; }
  `;
  const { code, css } = compileWithCSS(input);
  expect(css).toContain('padding: 1rem');
  expect(css).toContain('border-radius: 0.5rem');
  expect(code).toContain('styles.card'); // replaced with hash class name
});

// IT-2A-2: Pseudo-state prefixes generate correct selectors
test('hover:bg:primary.700 generates :hover selector', () => {
  const input = `
    const styles = css({
      btn: ['bg:primary.600', 'hover:bg:primary.700', 'focus-visible:ring:2'],
    });
  `;
  const { css } = compileWithCSS(input);
  expect(css).toMatch(/:hover\s*\{[^}]*background-color/);
  expect(css).toMatch(/:focus-visible\s*\{[^}]*ring/);
});

// IT-2A-3: Invalid token produces compile error
test('invalid design token produces actionable error', () => {
  const input = `
    const styles = css({ card: ['bg:nonexistent'] });
  `;
  const { diagnostics } = compileWithDiagnostics(input);
  expect(diagnostics[0].code).toBe('invalid-token');
  expect(diagnostics[0].message).toContain('nonexistent');
});

// IT-2A-4: Mixed array + object form compiles correctly
test('mixed array and object form compose in css()', () => {
  const input = `
    const styles = css({
      card: [
        'p:4', 'bg:background',
        { '&::after': ['content:empty', 'block'] },
      ],
    });
  `;
  const { css } = compileWithCSS(input);
  expect(css).toContain('padding: 1rem');
  expect(css).toContain('::after');
});

// IT-2A-5: CSS extraction produces separate .css file (not inlined in JS)
test('css() styles are extracted to separate file', () => {
  const input = `
    const styles = css({ card: ['p:4', 'bg:white'] });
    function Card() { return <div class={styles.card} />; }
  `;
  const { jsCode, cssFile } = compileForProduction(input);
  expect(jsCode).not.toContain('padding');
  expect(cssFile).toContain('padding: 1rem');
});
```

### Sub-phase 2B: `variants()` (P2-2)

**Files created:**
- `packages/ui/src/css/variants.ts`

**Integration test acceptance criteria:**

```typescript
// IT-2B-1: variants() generates classes per variant combination
test('variants() generates correct classes for each variant', () => {
  const button = variants({
    base: ['inline-flex', 'font:medium', 'rounded:md'],
    variants: {
      intent: {
        primary: ['bg:primary.600', 'text:white'],
        secondary: ['bg:white', 'text:gray.700'],
      },
      size: {
        sm: ['text:xs', 'h:8'],
        md: ['text:sm', 'h:10'],
      },
    },
    defaultVariants: { intent: 'primary', size: 'md' },
  });

  const className = button({ intent: 'secondary', size: 'sm' });
  // className should include base + secondary + sm classes
  expect(className).toBeTruthy();
  expect(typeof className).toBe('string');
});

// IT-2B-2: Default variants apply when no override is given
test('default variants are used when not specified', () => {
  const button = variants({
    base: ['rounded:md'],
    variants: { size: { sm: ['h:8'], md: ['h:10'] } },
    defaultVariants: { size: 'md' },
  });
  const defaultClass = button();
  const smClass = button({ size: 'sm' });
  expect(defaultClass).not.toBe(smClass);
});
```

### Sub-phase 2C: `defineTheme()` (P2-3)

**Files created:**
- `packages/ui/src/css/theme.ts`
- `packages/ui/src/css/theme-provider.ts`
- `packages/ui-compiler/src/type-generation/theme-types.ts`
- `packages/ui-compiler/src/type-generation/css-properties.ts`

**Integration test acceptance criteria:**

```typescript
// IT-2C-1: defineTheme() generates CSS custom properties for contextual tokens
test('contextual tokens become CSS custom properties', () => {
  const theme = defineTheme({
    colors: {
      primary: { 500: '#3b82f6' },
      background: { DEFAULT: 'white' },
      foreground: { DEFAULT: '#111827' },
    },
  });
  const { css } = compileTheme(theme);
  expect(css).toContain('--color-background: white');
  expect(css).toContain('--color-foreground: #111827');
});

// IT-2C-2: Dark theme overrides contextual tokens via data-theme
test('dark theme swaps contextual tokens', () => {
  const theme = defineTheme({
    colors: {
      background: { DEFAULT: 'white', _dark: '#111827' },
      foreground: { DEFAULT: '#111827', _dark: 'white' },
    },
  });
  const { css } = compileTheme(theme);
  expect(css).toContain('[data-theme="dark"]');
  expect(css).toContain('--color-background: #111827');
});

// IT-2C-3: Type generation creates ThemeTokens types from defineTheme()
test('type generation produces valid ThemeTokens', () => {
  const types = generateThemeTypes(sampleTheme);
  expect(types).toContain("'primary.500': string");
  expect(types).toContain("'background': string");
});
```

### Sub-phase 2D: Zero-Runtime Extraction (P2-4)

**Files created:**
- `packages/ui-compiler/src/css-extraction/extractor.ts`
- `packages/ui-compiler/src/css-extraction/dead-css.ts`
- `packages/ui-compiler/src/css-extraction/route-css-manifest.ts`
- `packages/ui-compiler/src/css-extraction/code-splitting.ts`
- `packages/ui-compiler/src/css-extraction/hmr.ts`

**Integration test acceptance criteria:**

```typescript
// IT-2D-1: Dead CSS elimination removes styles from unused components
test('styles from tree-shaken components are eliminated', () => {
  const { cssBundle } = buildProject({
    'App.tsx': `import { Card } from './Card'; function App() { return <Card />; }`,
    'Card.tsx': `const s = css({ card: ['p:4'] }); export function Card() { return <div class={s.card} />; }`,
    'Unused.tsx': `const s = css({ unused: ['m:8'] }); export function Unused() { return <div class={s.unused} />; }`,
  });
  expect(cssBundle).toContain('padding: 1rem');
  expect(cssBundle).not.toContain('margin: 2rem');
});

// IT-2D-2: Route-level CSS code splitting produces per-route CSS
test('CSS is split per route', () => {
  const { routeCSS } = buildProjectWithRoutes({
    '/': { component: 'Home.tsx', styles: ['bg:blue'] },
    '/about': { component: 'About.tsx', styles: ['bg:red'] },
  });
  expect(routeCSS['/']).not.toContain('red');
  expect(routeCSS['/about']).not.toContain('blue');
});
```

---

## Phase 3: Forms

**What it implements:** The `form()` API for SDK-aware form handling with type-safe validation, progressive enhancement, and FormData extraction.

**Blocked by:** Phase 1 (component model)
**Can parallel with:** Phases 2, 4, 5, 6
**External dependency:** `@vertz/codegen` (available -- PR #130 merged)
**Assigned to:** nora
**Estimate:** 32 hours

**Files created:**
- `packages/ui/src/form/form.ts`
- `packages/ui/src/form/form-data.ts`
- `packages/ui/src/form/validation.ts`
- All corresponding `__tests__/` files

**What to implement:**
- `form(sdkMethod, opts?)` core -- starts with Option C (explicit schema)
- `attrs()` returning `{ action, method }` from SDK endpoint
- `handleSubmit({ onSuccess, onError })` with FormData extraction
- `formDataToObject(formData)` converter with type coercion
- Field-level `error(fieldName)` accessor with type-safe field names
- `submitting` reactive state
- Progressive enhancement (works without JS)
- Explicit schema override option
- Multi-step form support
- Integration with `@vertz/schema` validation

**Integration test acceptance criteria:**

```typescript
// IT-3-1: form() creates a working form with SDK submission
test('form() submits valid data through SDK method', async () => {
  server.use(
    mockHandlers.users.create(({ request }) => ({
      id: '1', ...request.body, createdAt: '2026-01-01',
    }))
  );

  function CreateUser() {
    const userForm = form(api.users.create, { schema: createUserBodySchema });
    let result: User | null = null;
    return (
      <form
        {...userForm.attrs()}
        onSubmit={userForm.handleSubmit({ onSuccess: (u) => { result = u; } })}
      >
        <input name="name" value="Alice" />
        <input name="email" value="alice@test.com" />
        <button type="submit">Create</button>
      </form>
    );
  }

  const { findByText, click } = renderTest(<CreateUser />);
  await click(findByText('Create'));
  // Verify SDK was called with correct data
});

// IT-3-2: form() validates client-side before submission
test('form() shows validation errors without calling SDK', async () => {
  function CreateUser() {
    const userForm = form(api.users.create, { schema: createUserBodySchema });
    return (
      <form onSubmit={userForm.handleSubmit({})}>
        <input name="name" value="" />
        <span>{userForm.error('name')}</span>
        <button type="submit">Create</button>
      </form>
    );
  }

  const { findByText, click } = renderTest(<CreateUser />);
  await click(findByText('Create'));
  expect(findByText(/required/i)).toBeTruthy();
});

// IT-3-3: formDataToObject converts FormData with type coercion
test('formDataToObject handles string-to-number coercion', () => {
  const fd = new FormData();
  fd.set('name', 'Alice');
  fd.set('age', '30');
  const obj = formDataToObject(fd);
  expect(obj).toEqual({ name: 'Alice', age: '30' }); // schema coercion happens in validation step
});

// IT-3-4: attrs() returns action and method from SDK metadata
test('attrs() returns correct action and method', () => {
  const userForm = form(api.users.create, { schema: createUserBodySchema });
  const attrs = userForm.attrs();
  expect(attrs.action).toContain('/users');
  expect(attrs.method).toBe('POST');
});
```

---

## Phase 4: Data Fetching

**What it implements:** The `query()` API for reactive data fetching with auto-generated cache keys, deduplication, and SSR handoff.

**Blocked by:** Phase 1 (reactivity runtime)
**Can parallel with:** Phases 2, 3, 5, 6
**External dependency:** `@vertz/codegen` (available)
**Assigned to:** nora
**Estimate:** 32 hours

**Files created:**
- `packages/ui/src/query/query.ts`
- `packages/ui/src/query/cache.ts`
- `packages/ui/src/query/key-derivation.ts`
- All corresponding `__tests__/` files

**What to implement:**
- `query(() => sdkCall, opts)` thunk-based API with reactive dependency tracking
- Cache key derivation from thunk execution (URL + method + params)
- Query-level cache store with abstract CacheStore interface
- `.data`, `.loading`, `.error`, `.refetch` reactive accessors
- `initialData` support for SSR handoff
- `debounce` option for search/filter queries
- `enabled` option for conditional fetching
- Custom `key` override
- `revalidate()` for mutation-triggered refetching
- Query deduplication (concurrent identical requests)

**Integration test acceptance criteria:**

```typescript
// IT-4-1: query() fetches data and exposes reactive accessors
test('query() returns loading then data', async () => {
  server.use(
    mockHandlers.users.list(() => [{ id: '1', name: 'Alice' }])
  );

  function UserList() {
    const results = query(() => api.users.list());
    return (
      <div>
        {results.loading && <span>Loading</span>}
        {results.data && <span>{results.data[0].name}</span>}
      </div>
    );
  }

  const { findByText } = renderTest(<UserList />);
  expect(findByText('Loading')).toBeTruthy();
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
});

// IT-4-2: query() refetches when reactive dependency changes
test('query() refetches on dependency change', async () => {
  let callCount = 0;
  server.use(
    mockHandlers.users.list(({ request }) => {
      callCount++;
      const url = new URL(request.url);
      const q = url.searchParams.get('q');
      return q === 'Bob' ? [{ id: '2', name: 'Bob' }] : [{ id: '1', name: 'Alice' }];
    })
  );

  function Search() {
    let search = '';
    const results = query(() => api.users.list({ query: { q: search } }));
    return (
      <div>
        <input onInput={(e) => search = e.currentTarget.value} />
        <span>{results.data?.[0]?.name}</span>
      </div>
    );
  }

  const { findByText, type } = renderTest(<Search />);
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
  await type('input', 'Bob');
  await waitFor(() => expect(findByText('Bob')).toBeTruthy());
  expect(callCount).toBe(2);
});

// IT-4-3: Query deduplication -- concurrent identical requests produce single fetch
test('concurrent identical queries produce one fetch', async () => {
  let fetchCount = 0;
  server.use(
    mockHandlers.users.list(() => { fetchCount++; return []; })
  );

  function Parallel() {
    const a = query(() => api.users.list());
    const b = query(() => api.users.list());
    return <div>{a.loading || b.loading ? 'loading' : 'done'}</div>;
  }

  const { findByText } = renderTest(<Parallel />);
  await waitFor(() => expect(findByText('done')).toBeTruthy());
  expect(fetchCount).toBe(1);
});

// IT-4-4: initialData skips the initial fetch (SSR handoff)
test('initialData prevents initial fetch', async () => {
  let fetchCount = 0;
  server.use(mockHandlers.users.list(() => { fetchCount++; return []; }));

  function Prefetched() {
    const results = query(() => api.users.list(), {
      initialData: [{ id: '1', name: 'Prefetched' }],
    });
    return <span>{results.data[0].name}</span>;
  }

  const { findByText } = renderTest(<Prefetched />);
  expect(findByText('Prefetched')).toBeTruthy();
  expect(fetchCount).toBe(0);
});
```

---

## Phase 5: SSR & Hydration

**What it implements:** Server-side rendering with streaming, out-of-order Suspense boundaries, atomic per-component hydration with eager/lazy/interaction strategies.

**Blocked by:** Phase 1 (component model)
**Can parallel with:** Phases 2, 3, 4, 6
**Assigned to:** nora
**Estimate:** 72 hours (P5-1: 40h, P5-2: 32h)

### Sub-phase 5A: Server-Side Rendering (P5-1)

**Files created:**
- `packages/ui-server/src/index.ts`
- `packages/ui-server/src/render-to-stream.ts`
- `packages/ui-server/src/html-serializer.ts`
- `packages/ui-server/src/streaming.ts`
- `packages/ui-server/src/slot-placeholder.ts`
- `packages/ui-server/src/template-chunk.ts`
- `packages/ui-server/src/head.ts`
- `packages/ui-server/src/asset-pipeline.ts`
- `packages/ui-server/src/critical-css.ts`
- `packages/ui-server/src/hydration-markers.ts`

**Integration test acceptance criteria:**

```typescript
// IT-5A-1: renderToStream produces valid HTML
test('renderToStream returns complete HTML', async () => {
  function App() { return <div><h1>Hello</h1></div>; }
  const stream = renderToStream(<App />);
  const html = await streamToString(stream);
  expect(html).toContain('<h1>Hello</h1>');
});

// IT-5A-2: Suspense emits placeholder, then replacement chunk
test('Suspense streams out-of-order', async () => {
  function Async() {
    return <Suspense fallback={<div id="v-slot-1">Loading...</div>}>
      <AsyncContent />
    </Suspense>;
  }

  const chunks = await collectStreamChunks(renderToStream(<Async />));
  // First chunk should contain the placeholder
  expect(chunks[0]).toContain('v-slot-1');
  expect(chunks[0]).toContain('Loading...');
  // Later chunk should contain the replacement template
  expect(chunks.some(c => c.includes('v-tmpl-1'))).toBe(true);
});

// IT-5A-3: Interactive components get hydration markers
test('interactive components have data-v-id markers', async () => {
  function Interactive() { let count = 0; return <button onClick={() => count++}>{count}</button>; }
  const html = await streamToString(renderToStream(<Interactive />));
  expect(html).toContain('data-v-id');
  expect(html).toContain('application/json'); // serialized props
});

// IT-5A-4: Static components have NO hydration markers
test('static components produce no JS markers', async () => {
  function Static() { const title = "Hello"; return <h1>{title}</h1>; }
  const html = await streamToString(renderToStream(<Static />));
  expect(html).not.toContain('data-v-id');
});

// IT-5A-5: Head component injects meta/title into the stream
test('Head component injects <title> into HTML head', async () => {
  function Page() {
    return (<><Head><title>My Page</title></Head><div>Content</div></>);
  }
  const html = await streamToString(renderToStream(<Page />));
  expect(html).toContain('<title>My Page</title>');
});
```

### Sub-phase 5B: Atomic Hydration (P5-2)

**Files created:**
- `packages/ui/src/hydrate/hydrate.ts`
- `packages/ui/src/hydrate/strategies.ts`
- `packages/ui/src/hydrate/component-registry.ts`
- `packages/ui/src/hydrate/props-deserializer.ts`
- `packages/ui-compiler/src/transformers/hydration-transformer.ts`

**Integration test acceptance criteria:**

```typescript
// IT-5B-1: Hydration bootstraps interactive components from server HTML
test('hydrate() bootstraps interactive component from server-rendered HTML', () => {
  document.body.innerHTML = `
    <div data-v-id="Counter" data-v-key="c1">
      <script type="application/json">{"initial":0}</script>
      <button>0</button>
    </div>
  `;

  hydrate({ 'Counter': () => import('./Counter') });

  // After hydration, clicking the button should update
  const button = document.querySelector('button')!;
  button.click();
  expect(button.textContent).toBe('1');
});

// IT-5B-2: Lazy hydration uses IntersectionObserver
test('lazy hydration delays until element is visible', () => {
  document.body.innerHTML = `
    <div data-v-id="LazyComponent" data-v-key="l1" hydrate="lazy">
      <script type="application/json">{}</script>
      <div>Content</div>
    </div>
  `;

  const hydrateSpy = vi.fn();
  hydrate({ 'LazyComponent': hydrateSpy });

  // Should NOT have hydrated yet (element not visible in test env)
  expect(hydrateSpy).not.toHaveBeenCalled();

  // Simulate intersection
  triggerIntersection(document.querySelector('[data-v-id]')!);
  expect(hydrateSpy).toHaveBeenCalled();
});

// IT-5B-3: Interaction hydration triggers on first user event
test('interaction hydration triggers on first click', () => {
  document.body.innerHTML = `
    <div data-v-id="InteractiveComponent" data-v-key="i1" hydrate="interaction">
      <script type="application/json">{}</script>
      <button>Click me</button>
    </div>
  `;

  const hydrateSpy = vi.fn();
  hydrate({ 'InteractiveComponent': hydrateSpy });
  expect(hydrateSpy).not.toHaveBeenCalled();

  document.querySelector('button')!.click();
  expect(hydrateSpy).toHaveBeenCalled();
});

// IT-5B-4: Compiler marks interactive components for hydration, skips static ones
test('compiler generates hydration markers for let-using components only', () => {
  const interactive = `function Counter() { let c = 0; return <button onClick={() => c++}>{c}</button>; }`;
  const static_ = `function Title() { return <h1>Hello</h1>; }`;

  const iOutput = compile(interactive);
  const sOutput = compile(static_);

  expect(iOutput).toContain('data-v-id');
  expect(sOutput).not.toContain('data-v-id');
});
```

---

## Phase 6: Router

**What it implements:** `defineRoutes()` with typed params, `searchParams` schema, nested layouts, parallel loaders, code splitting, and navigation API.

**Blocked by:** Phase 1 (component model)
**Can parallel with:** Phases 2, 3, 4, 5
**Assigned to:** nora
**Estimate:** 40 hours

**Files created:**
- `packages/ui/src/router/define-routes.ts`
- `packages/ui/src/router/matcher.ts`
- `packages/ui/src/router/loader.ts`
- `packages/ui/src/router/params.ts`
- `packages/ui/src/router/search-params.ts`
- `packages/ui/src/router/navigate.ts`
- `packages/ui/src/router/link.ts`
- `packages/ui/src/router/outlet.ts`
- All corresponding `__tests__/` files

**What to implement:**
- `defineRoutes()` configuration API
- Route matching and resolution (path patterns with `:param` and `*` wildcard)
- Template literal type inference for route params (`/:id` -> `{ id: string }`)
- `searchParams` schema integration with `@vertz/schema`
- Nested layouts with children slot (layout persists across child navigation)
- Parallel loader execution (parent + child loaders fire simultaneously)
- Route-level code splitting (lazy component imports)
- Route-level error components
- `useSearchParams()` typed hook
- `router.navigate()` and `revalidate()`
- `<Link>` component with active state
- `LoaderData<Route>` type utility

**Integration test acceptance criteria:**

```typescript
// IT-6-1: defineRoutes matches paths and extracts typed params
test('route matching extracts params from URL', () => {
  const routes = defineRoutes({
    '/users/:id': { component: () => UserDetail, loader: async ({ params }) => params },
  });
  const match = matchRoute(routes, '/users/123');
  expect(match.params).toEqual({ id: '123' });
});

// IT-6-2: Nested layouts render children correctly
test('nested layout renders child route', async () => {
  const routes = defineRoutes({
    '/users': {
      component: () => Layout,
      children: {
        '/': { component: () => UserList },
        '/:id': { component: () => UserDetail },
      },
    },
  });

  const { findByText } = renderTest(createTestRouter(routes, { initialPath: '/users' }));
  expect(findByText('User List')).toBeTruthy();
  expect(findByText('Layout Header')).toBeTruthy();
});

// IT-6-3: Parallel loaders fire simultaneously
test('parent and child loaders execute in parallel', async () => {
  const loadOrder: string[] = [];
  const routes = defineRoutes({
    '/users': {
      component: () => Layout,
      loader: async () => { loadOrder.push('parent'); return {}; },
      children: {
        '/:id': {
          component: () => UserDetail,
          loader: async () => { loadOrder.push('child'); return {}; },
        },
      },
    },
  });

  await navigateTo(routes, '/users/123');
  // Both should fire -- order may vary but both must complete
  expect(loadOrder).toContain('parent');
  expect(loadOrder).toContain('child');
});

// IT-6-4: searchParams schema validates and coerces query string
test('searchParams coerces query string values', () => {
  const routes = defineRoutes({
    '/users': {
      component: () => UserList,
      searchParams: s.object({ page: s.coerce.number().default(1) }),
    },
  });

  const match = matchRoute(routes, '/users?page=3');
  expect(match.search.page).toBe(3); // number, not string
});

// IT-6-5: Code splitting lazily loads route components
test('route component is lazily loaded on navigation', async () => {
  let loaded = false;
  const routes = defineRoutes({
    '/lazy': {
      component: () => { loaded = true; return import('./LazyPage'); },
    },
  });

  expect(loaded).toBe(false);
  await navigateTo(routes, '/lazy');
  expect(loaded).toBe(true);
});

// IT-6-6: Route error component renders on loader failure
test('error component renders when loader throws', async () => {
  const routes = defineRoutes({
    '/fail': {
      component: () => Page,
      error: () => ErrorPage,
      loader: async () => { throw new Error('Not Found'); },
    },
  });

  const { findByText } = renderTest(createTestRouter(routes, { initialPath: '/fail' }));
  await waitFor(() => expect(findByText('Not Found')).toBeTruthy());
});
```

---

## Phase 7: @vertz/primitives -- Headless Components

**What it implements:** Accessible, unstyled, behavior-only components following WAI-ARIA patterns. Compound component pattern with keyboard navigation and focus management.

**Blocked by:** Phase 1 (reactivity) + Phase 2 (CSS framework, for styled consumers/tests)
**Can parallel with:** Nothing (depends on Phase 2)
**Assigned to:** nora
**Estimate:** 80 hours

**Files created:** Entire `packages/primitives/` directory (see Package Structure above)

**Implementation priority order:** Button, Dialog, Select, Menu, Tabs, Accordion, Tooltip, Popover, Toast, Combobox, Switch, Checkbox, Radio, Slider, Progress.

**What to implement per component:**
- WAI-ARIA role and state attributes
- Keyboard navigation (arrow keys, Enter, Escape, Tab, Home/End)
- Focus management (trap for modals, roving for lists)
- Compound component pattern (Root, Trigger, Content, Item)
- Support for controlled and uncontrolled usage
- `data-state` attributes for CSS styling hooks

**Shared utilities:**
- `packages/primitives/src/utils/keyboard.ts` -- Key event handlers, arrow key navigation
- `packages/primitives/src/utils/focus.ts` -- Focus trap, focus return, roving tabindex
- `packages/primitives/src/utils/aria.ts` -- ARIA ID generation, state management
- `packages/primitives/src/utils/id.ts` -- Deterministic unique IDs

**Integration test acceptance criteria:**

```typescript
// IT-7-1: Dialog traps focus and closes on Escape
test('Dialog traps focus and closes on Escape', async () => {
  function App() {
    let open = false;
    return (
      <div>
        <button onClick={() => open = true}>Open</button>
        <Dialog.Root open={open} onOpenChange={(v) => open = v}>
          <Dialog.Content>
            <input data-testid="first" />
            <button data-testid="close">Close</button>
          </Dialog.Content>
        </Dialog.Root>
      </div>
    );
  }

  const { findByText, click, press, queryByTestId } = renderTest(<App />);
  await click(findByText('Open'));
  expect(queryByTestId('first')).toBeTruthy();

  // Focus should be trapped inside dialog
  expect(document.activeElement).toBe(queryByTestId('first'));

  // Escape closes
  await press('Escape');
  expect(queryByTestId('first')).toBeNull();
});

// IT-7-2: Select supports keyboard navigation (Arrow keys, Enter, Escape)
test('Select keyboard navigation', async () => {
  function App() {
    let value = '';
    return (
      <Select.Root value={value} onValueChange={(v) => value = v}>
        <Select.Trigger>Pick one</Select.Trigger>
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b">Beta</Select.Item>
          <Select.Item value="c">Gamma</Select.Item>
        </Select.Content>
      </Select.Root>
    );
  }

  const { findByText, click, press } = renderTest(<App />);
  await click(findByText('Pick one'));
  await press('ArrowDown'); // Focus Alpha
  await press('ArrowDown'); // Focus Beta
  await press('Enter'); // Select Beta
  expect(findByText('Beta')).toBeTruthy(); // Trigger shows selected value
});

// IT-7-3: Tabs use correct ARIA roles and keyboard navigation
test('Tabs have correct ARIA roles and arrow key navigation', async () => {
  function App() {
    return (
      <Tabs.Root defaultValue="tab1">
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content 1</Tabs.Content>
        <Tabs.Content value="tab2">Content 2</Tabs.Content>
      </Tabs.Root>
    );
  }

  const { findByText, press, container } = renderTest(<App />);
  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist).toBeTruthy();

  const tabs = container.querySelectorAll('[role="tab"]');
  expect(tabs).toHaveLength(2);

  // Arrow right moves to next tab
  tabs[0].focus();
  await press('ArrowRight');
  expect(document.activeElement).toBe(tabs[1]);
  expect(findByText('Content 2')).toBeTruthy();
});

// IT-7-4: Every component passes WAI-ARIA compliance
test('all primitives have correct ARIA attributes', () => {
  // Button
  const { container: btnContainer } = renderTest(<Button.Root>Click</Button.Root>);
  expect(btnContainer.querySelector('[role="button"]')).toBeTruthy();

  // Dialog
  // ... (each component validated for ARIA compliance)
});

// IT-7-5: Toast uses aria-live for screen reader announcements
test('Toast announces via aria-live region', () => {
  const { container } = renderTest(<Toast.Provider><Toast.Root>Saved!</Toast.Root></Toast.Provider>);
  expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  expect(container.textContent).toContain('Saved!');
});
```

---

## Phase 8: Testing & DX

**What it implements:** Test utilities (`renderTest`, `createTestRouter`, `fillForm`, `submitForm`), typed MSW handler integration, DevTools hooks, compiler error message quality, and complete Vite plugin (HMR, production build, code splitting, watch mode).

**Blocked by:** Phases 1-6 (needs the full API surface to test against)
**Can parallel with:** Phase 7 (primitives can be developed alongside)
**Assigned to:** nora + ava
**Estimate:** 72 hours (P8-1: 40h, P8-2: 32h)

### Sub-phase 8A: Testing Utilities (P8-1)

**Files created:**
- `packages/ui/src/test/render-test.ts`
- `packages/ui/src/test/queries.ts`
- `packages/ui/src/test/interactions.ts`
- `packages/ui/src/test/test-router.ts`

**What to implement:**
- `renderTest()` with lightweight DOM implementation (happy-dom/jsdom)
- `findByText(text)`, `queryByText(text)`, `findByTestId(id)` query utilities
- `click(element)`, `type(selector, text)` interaction utilities
- `createTestRouter(routes, opts)` for route-level testing
- `fillForm(form, data)` and `submitForm(form)` for form testing
- DevTools signal dependency graph hook
- DevTools component tree inspection hook
- Compiler error message quality -- all diagnostics are actionable and LLM-friendly

**Integration test acceptance criteria:**

```typescript
// IT-8A-1: renderTest creates component and provides query utilities
test('renderTest provides findByText and click', async () => {
  function Counter() {
    let count = 0;
    return (
      <div>
        <span>Count: {count}</span>
        <button onClick={() => count++}>+</button>
      </div>
    );
  }

  const { findByText, click } = renderTest(<Counter />);
  expect(findByText('Count: 0')).toBeTruthy();
  await click(findByText('+'));
  expect(findByText('Count: 1')).toBeTruthy();
});

// IT-8A-2: createTestRouter renders routes with mocked loaders
test('createTestRouter renders route with loader data', async () => {
  server.use(mockHandlers.users.list(() => [{ id: '1', name: 'Alice' }]));

  const router = createTestRouter(routes, { initialPath: '/users' });
  const { findByText } = renderTest(router.component);
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
});

// IT-8A-3: fillForm and submitForm simulate form interaction
test('fillForm + submitForm exercise the full form lifecycle', async () => {
  server.use(mockHandlers.users.create(() => ({ id: '1', name: 'Alice', email: 'a@t.com' })));

  const { container } = renderTest(<CreateUser />);
  await fillForm(container.querySelector('form')!, { name: 'Alice', email: 'a@t.com' });
  await submitForm(container.querySelector('form')!);
  // Assert submission was successful
});
```

### Sub-phase 8B: Vite Plugin Complete (P8-2)

**Files modified:**
- `packages/ui-compiler/src/vite-plugin.ts` (complete implementation)

**What to implement:**
- Full Vite plugin setup and configuration
- Component HMR (hot module replacement)
- CSS HMR for instant style updates
- Production build with CSS extraction and minification
- Code splitting per route
- Source map generation for all transforms
- Watch mode: auto-detect `.vertz/generated/` changes, trigger HMR
- Filesystem-based coordination with codegen output (no custom coordination needed)

**Integration test acceptance criteria:**

```typescript
// IT-8B-1: Vite plugin produces working production build
test('production build produces optimized output', async () => {
  const result = await buildProject(projectFixture);
  expect(result.js).toBeDefined();
  expect(result.css).toBeDefined();
  expect(result.js).not.toContain('__signal'); // runtime should be minified
  expect(result.sourcemaps).toBeDefined();
});

// IT-8B-2: CSS changes trigger HMR without full reload
test('CSS HMR updates styles without page reload', async () => {
  const server = await createDevServer(projectFixture);
  const page = await server.openPage('/');

  // Modify a css() block
  await server.updateFile('Card.tsx', updateCSS('p:4', 'p:8'));

  // Assert style updated without full reload
  const reloadCount = await page.evaluate(() => window.__hmrReloadCount);
  expect(reloadCount).toBe(0); // no full reload
});

// IT-8B-3: Watch mode picks up codegen output changes
test('codegen file change triggers HMR in UI components', async () => {
  const server = await createDevServer(projectFixture);

  // Simulate codegen writing a new file
  await writeFile('.vertz/generated/types/users.ts', updatedTypes);

  // UI components importing from users types should be invalidated
  const invalidated = await server.getInvalidatedModules();
  expect(invalidated.some(m => m.includes('UserList'))).toBe(true);
});
```

---

## Milestone Tracking

Since we are locked out of Linear, use this section for tracking progress.

### Phase 1: Reactivity & Compiler Foundation
- **Status:** Not Started
- **Assigned to:** nora + ben
- **Blocked by:** None
- **Estimate:** 128 hours

#### Sub-phase 1A: Reactivity Runtime (40h)
- [ ] `[P1-1a]` signal() with .value, .peek(), .notify() -- core reactive container
- [ ] `[P1-1b]` computed() with lazy evaluation and diamond deduplication
- [ ] `[P1-1c]` effect() with automatic dependency tracking
- [ ] `[P1-1d]` batch() for grouped updates with single flush
- [ ] `[P1-1e]` untrack() for non-tracking reads
- [ ] `[P1-1f]` DOM helpers: __text(), __element(), __attr(), __show(), __classList()
- [ ] `[P1-1g]` __on() event binding
- [ ] `[P1-1h]` __conditional() for ternary JSX
- [ ] `[P1-1i]` __list() keyed reconciliation with DOM node reuse
- [ ] `[P1-1j]` Cleanup/disposal infrastructure

#### Sub-phase 1B: Compiler Core (56h)
- [ ] `[P1-2a]` Component function detection (functions returning JSX)
- [ ] `[P1-2b]` Two-pass taint analysis (collect let, check JSX refs)
- [ ] `[P1-2c]` let -> signal() transform
- [ ] `[P1-2d]` const -> computed() for transitive dependencies
- [ ] `[P1-2e]` let destructuring -> computed per binding
- [ ] `[P1-2f]` JSX expression -> subscription code generation
- [ ] `[P1-2g]` Static JSX -> no-tracking code path
- [ ] `[P1-2h]` Prop getter wrapping for reactive values
- [ ] `[P1-2i]` Prop plain pass-through for static values
- [ ] `[P1-2j]` Mutation transform: .push(), .pop(), etc. -> peek() + notify()
- [ ] `[P1-2k]` Mutation transform: property assignment, delete, indexed assignment
- [ ] `[P1-2l]` Mutation diagnostics for const variables
- [ ] `[P1-2m]` Props destructuring diagnostic
- [ ] `[P1-2n]` Source map generation (MagicString)
- [ ] `[P1-2o]` Vite plugin skeleton integration

#### Sub-phase 1C: Component Model (32h)
- [ ] `[P1-3a]` onMount(callback) -- runs once on mount
- [ ] `[P1-3b]` onCleanup(fn) -- teardown on unmount/re-run
- [ ] `[P1-3c]` watch(() => dep, callback) -- reactive side effect
- [ ] `[P1-3d]` createContext() and useContext() with Provider
- [ ] `[P1-3e]` ref<T>() for DOM element access
- [ ] `[P1-3f]` ErrorBoundary with fallback and retry
- [ ] `[P1-3g]` Suspense for async boundaries
- [ ] `[P1-3h]` Children slot mechanism

---

### Phase 2: CSS Framework
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1
- **Estimate:** 128 hours

#### Tasks
- [ ] `[P2-1a]` Array shorthand parser (property:value strings)
- [ ] `[P2-1b]` Pseudo-state prefix parser (hover:, focus:, etc.)
- [ ] `[P2-1c]` Object syntax support with full CSS property names
- [ ] `[P2-1d]` Mixed form support (array + object escape hatches)
- [ ] `[P2-1e]` Design token resolution at compile time
- [ ] `[P2-1f]` Type-safe token validation with compile errors
- [ ] `[P2-1g]` CSS Modules-style hash class name generation
- [ ] `[P2-1h]` CSS file extraction (not inlined in JS)
- [ ] `[P2-2a]` variants() API with base + variant definitions
- [ ] `[P2-2b]` Type inference for variant names and values
- [ ] `[P2-2c]` Default + compound variant support
- [ ] `[P2-3a]` defineTheme() with raw + contextual tokens
- [ ] `[P2-3b]` Token type generation (ThemeTokens from definitions)
- [ ] `[P2-3c]` CSS custom property generation for contextual tokens
- [ ] `[P2-3d]` ThemeProvider + data-theme switching
- [ ] `[P2-4a]` Dead CSS elimination via component usage analysis
- [ ] `[P2-4b]` Route-to-CSS mapping manifest generation
- [ ] `[P2-4c]` Route-level CSS code splitting
- [ ] `[P2-4d]` Critical CSS inlining for streaming SSR
- [ ] `[P2-4e]` CSS HMR integration for Vite dev mode

---

### Phase 3: Forms
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1
- **Estimate:** 32 hours

#### Tasks
- [ ] `[P3-1]` form(sdkMethod, { schema }) core implementation
- [ ] `[P3-2]` attrs() returning { action, method } from SDK endpoint
- [ ] `[P3-3]` handleSubmit() with FormData extraction + validation
- [ ] `[P3-4]` formDataToObject() with type coercion
- [ ] `[P3-5]` Field-level error() accessor
- [ ] `[P3-6]` submitting reactive state
- [ ] `[P3-7]` Progressive enhancement (works without JS)
- [ ] `[P3-8]` Multi-step form support

---

### Phase 4: Data Fetching
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1
- **Estimate:** 32 hours

#### Tasks
- [ ] `[P4-1]` query() thunk-based API with reactive dep tracking
- [ ] `[P4-2]` Cache key derivation from SDK call arguments
- [ ] `[P4-3]` Query-level cache store with CacheStore interface
- [ ] `[P4-4]` .data, .loading, .error, .refetch reactive accessors
- [ ] `[P4-5]` initialData support for SSR handoff
- [ ] `[P4-6]` debounce and enabled options
- [ ] `[P4-7]` revalidate() for mutation-triggered refetching
- [ ] `[P4-8]` Query deduplication

---

### Phase 5: SSR & Hydration
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1
- **Estimate:** 72 hours

#### Tasks
- [ ] `[P5-1a]` renderToStream() returning ReadableStream
- [ ] `[P5-1b]` Component-to-HTML serialization
- [ ] `[P5-1c]` Out-of-order streaming with Suspense boundaries
- [ ] `[P5-1d]` Slot placeholder mechanism (v-slot-N)
- [ ] `[P5-1e]` Template replacement chunks (v-tmpl-N)
- [ ] `[P5-1f]` Head component for meta/title
- [ ] `[P5-1g]` Asset pipeline (script/stylesheet injection)
- [ ] `[P5-2a]` Compiler analysis: detect interactive vs static components
- [ ] `[P5-2b]` data-v-id and data-v-key marker generation
- [ ] `[P5-2c]` Serialized props in <script type="application/json">
- [ ] `[P5-2d]` Client hydration runtime (~4.5KB bootstrap)
- [ ] `[P5-2e]` Eager hydration strategy
- [ ] `[P5-2f]` Lazy hydration (IntersectionObserver, default)
- [ ] `[P5-2g]` Interaction-triggered hydration
- [ ] `[P5-2h]` Auto-scaffolded entry-client.ts with component registry

---

### Phase 6: Router
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1
- **Estimate:** 40 hours

#### Tasks
- [ ] `[P6-1]` defineRoutes() configuration API
- [ ] `[P6-2]` Route matching with :param and * wildcard
- [ ] `[P6-3]` Template literal type inference for params
- [ ] `[P6-4]` searchParams schema integration
- [ ] `[P6-5]` Nested layouts with children slot
- [ ] `[P6-6]` Parallel loader execution
- [ ] `[P6-7]` Route-level code splitting (lazy imports)
- [ ] `[P6-8]` Route-level error components
- [ ] `[P6-9]` useSearchParams() typed hook
- [ ] `[P6-10]` router.navigate() and revalidate()
- [ ] `[P6-11]` <Link> component
- [ ] `[P6-12]` LoaderData<Route> type utility

---

### Phase 7: @vertz/primitives
- **Status:** Not Started
- **Assigned to:** nora
- **Blocked by:** Phase 1 + Phase 2
- **Estimate:** 80 hours

#### Tasks
- [ ] `[P7-1]` Keyboard navigation + focus management utilities
- [ ] `[P7-2]` Button primitive with ARIA
- [ ] `[P7-3]` Dialog primitive (modal/non-modal, focus trap)
- [ ] `[P7-4]` Select primitive (listbox pattern)
- [ ] `[P7-5]` Menu primitive (menubar/menuitem)
- [ ] `[P7-6]` Tabs primitive (tablist/tabpanel)
- [ ] `[P7-7]` Accordion primitive
- [ ] `[P7-8]` Tooltip primitive
- [ ] `[P7-9]` Popover primitive with positioning
- [ ] `[P7-10]` Toast primitive with live region
- [ ] `[P7-11]` Combobox/Autocomplete primitive
- [ ] `[P7-12]` Switch, Checkbox, Radio primitives
- [ ] `[P7-13]` Slider and Progress primitives
- [ ] `[P7-14]` WAI-ARIA compliance tests for all components

---

### Phase 8: Testing & DX
- **Status:** Not Started
- **Assigned to:** nora + ava
- **Blocked by:** Phases 1-6
- **Estimate:** 72 hours

#### Tasks
- [ ] `[P8-1a]` renderTest() with lightweight DOM
- [ ] `[P8-1b]` findByText, queryByText, findByTestId queries
- [ ] `[P8-1c]` click(), type() interaction utilities
- [ ] `[P8-1d]` createTestRouter() for route-level testing
- [ ] `[P8-1e]` fillForm() and submitForm() for form testing
- [ ] `[P8-1f]` DevTools signal dependency graph
- [ ] `[P8-1g]` DevTools component tree inspection
- [ ] `[P8-1h]` Compiler error message quality audit
- [ ] `[P8-2a]` Vite plugin full dev server integration
- [ ] `[P8-2b]` Component HMR
- [ ] `[P8-2c]` CSS HMR for instant style updates
- [ ] `[P8-2d]` Production build with extraction + minification
- [ ] `[P8-2e]` Code splitting per route
- [ ] `[P8-2f]` Source map generation for all transforms
- [ ] `[P8-2g]` Watch mode: codegen output -> Vite HMR

---

## Runtime Size Budget

| Module | Estimated gzip |
|--------|---------------|
| Signal core (signal, computed, effect) | ~1.5 KB |
| DOM helpers (__text, __element, __attr, __on, __conditional, __list) | ~2 KB |
| Lifecycle (onMount, onCleanup, watch, context) | ~0.5 KB |
| Suspense + ErrorBoundary | ~0.5 KB |
| **Total core runtime** | **~4.5 KB** |
| Router + query() + form() | ~3 KB (loaded separately) |
| Hydration bootstrap | ~4.5 KB |

---

## Verification Checklist

Before v1.0 ships:

1. **Zero unexpected deps**: `@vertz/ui` depends only on `@vertz/schema` (workspace). `@vertz/ui-server` depends on `@vertz/ui`. `@vertz/ui-compiler` depends on ts-morph and MagicString.
2. **ESM only**: `"type": "module"` in all packages.
3. **Tests pass**: `bun test` across all packages.
4. **Types pass**: `tsc --noEmit` with strict mode.
5. **Runtime budget**: Core runtime < 5KB gzip.
6. **Components execute once**: No re-execution. Signal subscriptions update specific DOM nodes.
7. **Mutation interception**: `.push()` on `let` arrays triggers DOM updates. `.push()` on `const` arrays emits diagnostic.
8. **CSS is zero-runtime**: All `css()` calls resolve at build time. No CSS-in-JS runtime in the browser.
9. **SSR streaming**: `renderToStream()` returns chunks. Suspense boundaries stream out of order.
10. **Hydration strategies**: Eager, lazy, and interaction strategies all work. Static components ship zero JS.
11. **Accessibility**: All `@vertz/primitives` components pass WAI-ARIA compliance tests.
12. **Build output**: Vite plugin produces optimized, code-split, source-mapped output.

---

## Open Items

- [ ] **SDK method `.meta` property**: Currently deferred. `form()` and `query()` work with explicit schema / thunk-based key derivation in v1.0. `.meta` enhancement tracked as a codegen follow-up for post-v1.0.
- [ ] **Entity-level cache**: v1.0 uses query-level cache. Abstract `CacheStore` interface allows future swap to entity normalization.
- [ ] **Vite plugin watch mode complexity**: Backend change -> compiler -> codegen -> HMR involves multi-process coordination. May benefit from a POC during Phase 8.
- [ ] **Primitives component priority**: Community demand and Volta requirements may reprioritize. Button, Dialog, Select, Menu are highest priority.
- [ ] **Responsive breakpoints in CSS**: v1.0 supports responsive via object form only (`{ gap: { DEFAULT: '4', md: '6' } }`). Responsive string prefixes (`md:p:4`) deferred per Appendix B decision.

---

## Self-Review (Nora -- Frontend Technical Feasibility)

Reviewing as Nora (vertz-dev-front), validating the plan against the explorations and design doc:

**Compiler phasing is correct.** Phase 1 establishes the reactive runtime and compiler together, which is the right order -- the compiler transforms depend on the runtime primitives existing. The mutation interception design from the reactive-mutations-compiler-design exploration is correctly incorporated: compile-time transform with `peek()` + `notify()`, not runtime Proxy.

**CSS framework integration is complete.** The plan includes all four CSS sub-phases from the exploration: `css()` with array shorthands (Appendix B is authoritative), `variants()`, `defineTheme()`, and zero-runtime extraction. The three reactive style strategies (class toggling, CSS custom properties, direct style mutation) are covered in the compiler transformer.

**Codegen impact is correctly reflected.** Phase 9 from the original roadmap (SDK generation) has been removed per the codegen impact analysis -- it was delivered by `@vertz/codegen` PR #130. Phases 3 and 4 correctly note `@vertz/codegen` as an available dependency, not a blocker. The explicit schema approach (Option C) for `form()` is the right call for v1.0.

**Nothing is missing from the explorations:**
- Array shorthand syntax (Appendix B) -- covered in Phase 2A
- Pseudo-state prefixes -- covered in Phase 2A
- Reactive style optimization (three strategies) -- covered in CSS transformer
- Mutation interception on let variables -- covered in Phase 1B
- Compiler diagnostics for const mutations -- covered in Phase 1B
- Live component streaming -- correctly marked as separate project
- Volta naming -- correctly scoped to v1.1, not in this plan
- Animations and feature flags -- correctly scoped to v1.1/v1.2

**Hydration design is sound.** The three strategies (eager, lazy via IntersectionObserver, interaction) match the design doc. The compiler's taint analysis naturally determines which components need hydration -- components with no `let` variables are static and ship zero JS.

**The test acceptance criteria are concrete and verifiable.** Every phase has specific integration tests with expected inputs and outputs. The TDD mandate is enforced -- each test is a failing test before the implementation.

**Estimate accuracy:** The total estimate is ~584 hours across 8 phases. This aligns with the roadmap's ~592 hours for v1.0. The slight reduction comes from removing Phase 9 (delivered by codegen).

**Risk assessment:**
- **Highest risk:** Phase 1B (compiler core, 56h) -- the two-pass taint analysis and seven transform rules are the most complex piece. Suggest a POC for the JSX-to-DOM transform before committing to the full implementation.
- **Medium risk:** Phase 5 (SSR + hydration, 72h) -- out-of-order streaming with Suspense is well-understood but has many edge cases.
- **Low risk:** Phases 3, 4, 6 -- forms, queries, and router are well-scoped with clear APIs.

The plan is ready for implementation. Any engineer (ben, nora) can pick up any phase and implement it without ambiguity.
