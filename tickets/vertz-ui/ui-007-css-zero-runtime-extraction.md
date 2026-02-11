# ui-007: Zero-Runtime CSS Extraction

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 2D — Zero-Runtime Extraction
- **Estimate:** 32 hours
- **Blocked by:** ui-004
- **Blocks:** ui-013, ui-015
- **PR:** —

## Description

Implement zero-runtime CSS extraction in the compiler: dead CSS elimination, route-to-CSS mapping manifest, route-level CSS code splitting, critical CSS inlining for streaming SSR, and CSS HMR integration for Vite dev mode.

All `css()` calls resolve at build time. No CSS-in-JS runtime ships in the browser.

### What to implement

- CSS file extractor — extracts CSS from `css()` calls into separate `.css` files
- Dead CSS elimination — removes styles from tree-shaken/unused components
- Route-to-CSS mapping manifest — maps routes to their CSS dependencies
- Route-level CSS code splitting — produces per-route CSS bundles
- Critical CSS inlining for streaming SSR
- CSS HMR integration for Vite dev mode (instant style updates without full reload)

### Files to create

- `packages/ui-compiler/src/css-extraction/extractor.ts`
- `packages/ui-compiler/src/css-extraction/dead-css.ts`
- `packages/ui-compiler/src/css-extraction/route-css-manifest.ts`
- `packages/ui-compiler/src/css-extraction/code-splitting.ts`
- `packages/ui-compiler/src/css-extraction/hmr.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 2D](../../plans/ui-implementation.md#sub-phase-2d-zero-runtime-extraction-p2-4)
- [CSS Framework Exploration](../../../backstage/research/explorations/native-css-framework-exploration.md)

## Acceptance Criteria

- [ ] CSS from `css()` calls is extracted to separate `.css` files
- [ ] No CSS-in-JS runtime code is present in production browser bundles
- [ ] Dead CSS elimination removes styles from unused/tree-shaken components
- [ ] Route-to-CSS mapping manifest is generated correctly
- [ ] Per-route CSS bundles are produced (route-level code splitting)
- [ ] Critical CSS is inlined for streaming SSR
- [ ] CSS HMR updates styles without full page reload in dev mode
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
