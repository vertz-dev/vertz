# ui-006: defineTheme() and Theming

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 2C — defineTheme()
- **Estimate:** 24 hours
- **Blocked by:** ui-004
- **Blocks:** ui-013
- **PR:** —

## Description

Implement `defineTheme()` for design tokens and theming, including raw tokens (exact values), contextual tokens (swap via CSS custom properties per theme), ThemeProvider component with `data-theme` switching, and type generation for theme tokens.

### What to implement

- `defineTheme()` with raw + contextual tokens
- CSS custom property generation for contextual tokens
- Dark theme support via `data-theme` attribute on the root element
- `ThemeProvider` component that sets `data-theme`
- Type generation: `ThemeTokens` types from `defineTheme()` definitions
- Token-aware `CSSProperties` interface generation

### Files to create

- `packages/ui/src/css/theme.ts`
- `packages/ui/src/css/theme-provider.ts`
- `packages/ui-compiler/src/type-generation/theme-types.ts`
- `packages/ui-compiler/src/type-generation/css-properties.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 2C](../../plans/ui-implementation.md#sub-phase-2c-definetheme-p2-3)
- [CSS Framework Exploration](../../../backstage/research/explorations/native-css-framework-exploration.md)

## Acceptance Criteria

- [ ] `defineTheme()` accepts raw and contextual token definitions
- [ ] Contextual tokens become CSS custom properties (e.g., `--color-background: white`)
- [ ] Dark theme tokens override contextual tokens via `[data-theme="dark"]`
- [ ] `ThemeProvider` component sets `data-theme` attribute
- [ ] Type generation produces valid `ThemeTokens` from `defineTheme()` call
- [ ] Token-aware `CSSProperties` interface is generated
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
