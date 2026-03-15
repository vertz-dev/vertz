# Link `class` Prop Alignment

**Issue:** [#1290](https://github.com/vertz-dev/vertz/issues/1290)
**Status:** Draft

## Problem

The `Link` component in `@vertz/ui` uses `className` for its static CSS class prop. Every other element in Vertz JSX uses `class` (the native HTML attribute). This inconsistency forces developers to remember which convention applies to which element.

## API Surface

### Before

```tsx
<Link href="/about" className={styles.link}>About</Link>
```

### After

```tsx
// Primary — consistent with all other elements
<Link href="/about" class={styles.link}>About</Link>

// Deprecated alias — existing code continues to work
<Link href="/about" className={styles.link}>About</Link>
```

### Type definition

```ts
export interface LinkProps<T extends Record<string, RouteConfigLike> = RouteDefinitionMap> {
  href: RoutePaths<T>;
  children: string | Node | (() => string | Node);
  activeClass?: string;
  /** Static class for the anchor element. */
  class?: string;
  /**
   * @deprecated Use `class` instead. Will be removed in v1.
   */
  className?: string;
  prefetch?: 'hover';
}
```

When both `class` and `className` are provided, `class` wins.

## Manifesto Alignment

- **Principle: No magic, no surprise** — `class` is the attribute name used everywhere else in Vertz JSX. Using `className` only on `Link` is the surprise.
- **Principle: Framework honesty** — Vertz doesn't pretend to be React. It uses `class` not `className`.

## Non-Goals

- Removing `className` entirely (breaking change, deferred to v1)
- Adding runtime deprecation warnings (too noisy for a prop rename)
- Changing any other component's prop naming

## Unknowns

None identified.

## Type Flow Map

No generics introduced. The existing `T` generic on `LinkProps` is unchanged.

## E2E Acceptance Test

```ts
describe('Feature: Link class prop', () => {
  describe('Given a Link with class prop', () => {
    describe('When rendered', () => {
      it('Then applies the class to the anchor element', () => {
        const el = Link({ children: 'Home', class: 'nav-link', href: '/' });
        expect(el.classList.contains('nav-link')).toBe(true);
      });
    });
  });

  describe('Given a Link with className prop (deprecated)', () => {
    describe('When rendered', () => {
      it('Then still applies the class to the anchor element', () => {
        const el = Link({ children: 'Home', className: 'nav-link', href: '/' });
        expect(el.classList.contains('nav-link')).toBe(true);
      });
    });
  });

  describe('Given a Link with both class and className', () => {
    describe('When rendered', () => {
      it('Then class takes precedence', () => {
        const el = Link({ children: 'Home', class: 'primary', className: 'secondary', href: '/' });
        expect(el.classList.contains('primary')).toBe(true);
        expect(el.classList.contains('secondary')).toBe(false);
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Add `class` prop and update tests (single phase)

1. **TDD: Add tests for `class` prop** on both `createLink` and context-based `Link`
   - `class` prop applies to anchor
   - `className` still works (backward compat)
   - `class` takes precedence over `className`
2. **Update `LinkProps`** — add `class?: string`, add `@deprecated` to `className`
3. **Update `createLink()` and `Link()`** — resolve `class ?? className`
4. **Update examples** — change all `<Link className=...>` to `<Link class=...>`
5. **Quality gates** — test, typecheck, lint

**Acceptance criteria:**
- All existing Link tests pass unchanged
- New tests for `class` prop pass
- All examples use `class` instead of `className`
- `className` still works but is typed as `@deprecated`
