# ui-005: variants() API

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 2B — variants()
- **Estimate:** 24 hours
- **Blocked by:** ui-004
- **Blocks:** ui-013
- **PR:** —

## Description

Implement the `variants()` API for typed component variants. This builds on the `css()` infrastructure from ui-004 and provides a way to define component variants with base styles, variant definitions, default variants, and compound variants.

### What to implement

- `variants()` API with base + variant definitions
- Type inference for variant names and values (variant props are fully typed)
- Default variant support — applied when no override is given
- Compound variant support — styles applied when multiple variant values match
- Class name generation per variant combination
- Integration with the `css()` shorthand syntax

### Files to create

- `packages/ui/src/css/variants.ts`
- Corresponding `__tests__/` file

### References

- [Implementation Plan — Phase 2B](../../plans/ui-implementation.md#sub-phase-2b-variants-p2-2)
- [CSS Framework Exploration](../../../backstage/research/explorations/native-css-framework-exploration.md)

## Acceptance Criteria

- [ ] `variants()` accepts base styles, variant definitions, and default variants
- [ ] Calling the returned function with variant props returns the correct class name
- [ ] Default variants are applied when no override is given
- [ ] Compound variants apply when multiple variant values match
- [ ] Type inference provides autocomplete for variant names and values
- [ ] Works with `css()` array shorthand syntax
- [ ] Integration tests pass (see below)

### Integration Tests

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

## Progress

- 2026-02-10: Ticket created from implementation plan.
