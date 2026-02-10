# ui-015: Vite Plugin Complete

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 8B — Vite Plugin Complete
- **Estimate:** 32 hours
- **Blocked by:** ui-001, ui-002, ui-003, ui-004, ui-007, ui-008, ui-009, ui-010, ui-011, ui-012
- **Blocks:** none
- **PR:** —

## Description

Complete the Vite plugin (`@vertz/ui-compiler`) that was initially scaffolded in ui-002. This adds full HMR support, production build optimization, code splitting, and watch mode integration with codegen output.

### What to implement

- Full Vite plugin setup and configuration
- Component HMR (hot module replacement) — component changes update without full page reload
- CSS HMR for instant style updates — `css()` block changes update styles without reload
- Production build with CSS extraction and minification
- Code splitting per route
- Source map generation for all transforms
- Watch mode: auto-detect `.vertz/generated/` changes, trigger HMR
- Filesystem-based coordination with codegen output (no custom coordination needed — Vite's file watcher handles `.vertz/generated/` changes)

### Files to modify/create

- `packages/ui-compiler/src/vite-plugin.ts` (complete implementation, extends skeleton from ui-002)
- Additional `__tests__/` files

### References

- [Implementation Plan — Phase 8B](../../plans/ui-implementation.md#sub-phase-8b-vite-plugin-complete-p8-2)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] Vite plugin produces working production build with optimized output
- [ ] Production build includes minified JS, extracted CSS, and source maps
- [ ] Component HMR works — changing component code updates without full page reload
- [ ] CSS HMR works — changing `css()` blocks updates styles without full page reload
- [ ] Code splitting produces per-route JS and CSS bundles
- [ ] Source maps are generated for all compiler transforms
- [ ] Watch mode detects `.vertz/generated/` file changes and triggers HMR
- [ ] UI components importing from generated types are invalidated when codegen re-runs
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
