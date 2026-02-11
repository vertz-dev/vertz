# ui-011: Atomic Hydration

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 5B — Atomic Hydration
- **Estimate:** 32 hours
- **Blocked by:** ui-010
- **Blocks:** ui-014
- **PR:** —

## Description

Implement atomic per-component hydration with three strategies: eager, lazy (IntersectionObserver, default), and interaction-triggered. The hydration bootstrap is approximately 4.5KB. Components are identified via `data-v-id` markers placed by the SSR pass (ui-010). Static components ship zero JS.

### What to implement

- `hydrate()` client entry point — bootstraps interactive components from server-rendered HTML
- Three hydration strategies:
  - **Eager** — hydrate immediately on page load
  - **Lazy** (default) — hydrate when element becomes visible (IntersectionObserver)
  - **Interaction** — hydrate on first user event (click, focus, etc.)
- Component registry — maps component IDs to dynamic imports
- Props deserializer — reads serialized props from `<script type="application/json">` tags
- Compiler hydration transformer — generates `data-v-id` markers for interactive components, skips static ones

### Files to create

- `packages/ui/src/hydrate/hydrate.ts`
- `packages/ui/src/hydrate/strategies.ts`
- `packages/ui/src/hydrate/component-registry.ts`
- `packages/ui/src/hydrate/props-deserializer.ts`
- `packages/ui-compiler/src/transformers/hydration-transformer.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 5B](../../plans/ui-implementation.md#sub-phase-5b-atomic-hydration-p5-2)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] `hydrate()` bootstraps interactive components from server-rendered HTML
- [ ] After hydration, components are fully interactive (event handlers work)
- [ ] Eager strategy hydrates immediately on page load
- [ ] Lazy strategy delays hydration until element is visible (IntersectionObserver)
- [ ] Interaction strategy delays hydration until first user event (click, focus)
- [ ] Component registry correctly maps IDs to dynamic imports
- [ ] Props deserializer reads serialized props from `<script type="application/json">` tags
- [ ] Compiler marks interactive components (with `let`) with `data-v-id`
- [ ] Compiler does NOT mark static components (no `let`) with `data-v-id`
- [ ] Hydration bootstrap is approximately 4.5KB gzip
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
