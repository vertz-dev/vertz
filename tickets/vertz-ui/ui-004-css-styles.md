# ui-004: css() Compile-Time Style Blocks

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 2A — css() compile-time style blocks
- **Estimate:** 48 hours
- **Blocked by:** ui-002 (compiler infrastructure)
- **Blocks:** ui-005, ui-006, ui-007, ui-013
- **PR:** —

## Description

Implement the `css()` API with array shorthand and object syntax, the shorthand parser, design token resolution, deterministic class name generation, CSS extraction from JS, and compiler integration (analyzer, transformer, diagnostics).

The primary syntax is array shorthands: `['p:4', 'bg:background']`. Pseudo-state prefixes are inline: `'hover:bg:primary.700'`. Object form is available for complex selectors. Both compose freely. Appendix B of the CSS exploration is authoritative.

### What to implement

- `css()` API — accepts named style blocks with array shorthand + object syntax
- Shorthand parser — parses `'property:value'` and `'pseudo:property:value'` strings
- Pseudo-state prefix support — `hover:`, `focus:`, `focus-visible:`, `active:`, `disabled:`, etc.
- Design token resolution at compile time
- Type-safe token validation with compile errors for invalid tokens
- CSS Modules-style hash-based deterministic class name generation
- `globalCss()` for resets and base styles
- `s()` inline style helper
- CSS analyzer in compiler — extract `css()` calls, identify static vs reactive styles
- CSS transformer in compiler — replace `css()` with class names, extract CSS
- CSS diagnostics — invalid tokens, magic numbers, layout-affecting animations

### Files to create

- `packages/ui/src/css/css.ts`
- `packages/ui/src/css/shorthand-parser.ts`
- `packages/ui/src/css/token-resolver.ts`
- `packages/ui/src/css/class-generator.ts`
- `packages/ui/src/css/global-css.ts`
- `packages/ui/src/css/s.ts`
- `packages/ui-compiler/src/analyzers/css-analyzer.ts`
- `packages/ui-compiler/src/transformers/css-transformer.ts`
- `packages/ui-compiler/src/diagnostics/css-diagnostics.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 2A](../../plans/ui-implementation.md#sub-phase-2a-css-compile-time-style-blocks-p2-1)
- [CSS Framework Exploration](../../../backstage/research/explorations/native-css-framework-exploration.md)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] `css()` accepts named style blocks with array shorthand syntax
- [ ] Shorthand parser correctly parses `'property:value'` strings
- [ ] Pseudo-state prefixes (`hover:`, `focus:`, `focus-visible:`, etc.) generate correct CSS selectors
- [ ] Object syntax works for complex selectors (e.g., `'&::after'`)
- [ ] Mixed array + object form composes correctly
- [ ] Design tokens resolve at compile time
- [ ] Invalid tokens produce actionable compile errors
- [ ] Deterministic hash-based class names are generated
- [ ] CSS is extracted to separate `.css` files (not inlined in JS)
- [ ] `globalCss()` works for resets and base styles
- [ ] `s()` inline style helper works
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
