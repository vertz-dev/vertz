# Design Doc: Simplify css() Media Query / Nested Selector Object Shape

**Issue:** #1296
**Status:** Approved (DX, Product, Technical)
**Author:** santiago-v2

---

## API Surface

### Before (verbose `{ property, value }` tuple)

```ts
const s = css({
  ctas: [
    'flex', 'flex-col', 'gap:4',
    {
      '@media (min-width: 640px)': [
        { property: 'flex-direction', value: 'row' },
        { property: 'align-items', value: 'center' },
      ],
    },
  ],
  panel: [
    'fixed', 'z:50',
    {
      '&': [
        { property: 'display', value: 'grid' },
        { property: 'width', value: '100%' },
      ],
      '&:hover': [{ property: 'opacity', value: '1' }],
    },
  ],
});
```

### After (plain key-value CSS object)

Nested selector values accept **either** an array of `StyleValue` or a direct `Record<string, string>`:

```ts
const s = css({
  ctas: [
    'flex', 'flex-col', 'gap:4',
    {
      // Direct object form — clean for pure CSS declarations
      '@media (min-width: 640px)': {
        'flex-direction': 'row',
        'align-items': 'center',
      },
    },
  ],
  panel: [
    'fixed', 'z:50',
    {
      '&': {
        display: 'grid',
        width: '100%',
      },
      '&:hover': { opacity: '1' },
    },
  ],
});
```

### When to use each form

- **Direct object** `{ 'flex-direction': 'row' }` — when using only raw CSS properties (no shorthands)
- **Array** `['text:foreground', { 'background-color': '...' }]` — when mixing shorthands with raw CSS

**Mixed usage** (shorthands + raw CSS in the same selector) uses array form with CSS objects:

```ts
{
  '[data-theme="dark"] &': ['text:foreground', { 'background-color': 'rgba(0,0,0,0.3)' }],
}
```

### Type Changes

```ts
// REMOVED:
// export interface RawDeclaration { property: string; value: string; }

// CHANGED:
/**
 * A value within a nested selector array: shorthand string or CSS declarations map.
 *
 * Use a string for design token shorthands: 'p:4', 'bg:primary'
 * Use Record<string, string> for raw CSS: { 'flex-direction': 'row' }
 */
export type StyleValue = string | Record<string, string>;

/**
 * A style entry: shorthand string or nested selectors map.
 *
 * Nested selector values can be:
 * - Array form: ['text:foreground', { 'background-color': 'red' }]
 * - Direct object: { 'flex-direction': 'row', 'align-items': 'center' }
 */
export type StyleEntry = string | Record<string, StyleValue[] | Record<string, string>>;
```

### Helper function changes (theme-shadcn)

Helpers return specific object types (not generic `Record<string, string>`) for IntelliSense:

```ts
// Before:
export function animationDecl(value: string): RawDeclaration {
  return { property: 'animation', value };
}

// After:
export function animationDecl(value: string): { animation: string } {
  return { animation: value };
}

export function bgOpacity(token: string, percent: number): { 'background-color': string } {
  return { 'background-color': `color-mix(...)` };
}
```

---

## Manifesto Alignment

- **Principle: Minimal boilerplate** — removes the verbose `{ property, value }` tuple in favor of standard CSS object notation (`{ [prop]: value }`). This matches every other CSS-in-JS library (Emotion, styled-components, vanilla-extract).
- **Principle: Familiar patterns** — `{ 'flex-direction': 'row' }` is how CSS declarations are expressed in every JS/TS CSS tool. The `{ property, value }` tuple is non-standard and surprising.
- **Tradeoff:** Breaking change to public API. Acceptable pre-v1 per our breaking changes policy.

---

## Non-Goals

- **No new CSS features** — this only changes the object shape, not what CSS can be expressed.
- **No backward compatibility** — the old `{ property, value }` shape is removed entirely (user directive).
- **No runtime performance changes** — the processing logic remains equivalent.

---

## Unknowns

None identified. The change is mechanical — new object shape, same CSS output.

---

## Type Flow Map

The generic flow is unchanged. `css<T extends CSSInput>(input: T)` returns `CSSOutput<T>`. The change only affects the shapes within `StyleValue` and `StyleEntry`:

```
User code → css({ block: [StyleEntry...] }) → StyleEntry → StyleValue → CSSDeclaration (internal)
                                                   ↓
                                              Record<string, string> (new)
                                              replaces
                                              { property, value } (old)
```

The internal `CSSDeclaration` type in `token-resolver.ts` is **unchanged** — it's used only internally for resolved CSS. The change only affects the input shape.

---

## E2E Acceptance Test

```ts
import { css } from '@vertz/ui';

// Direct object form for media queries
const s = css({
  layout: [
    'flex', 'flex-col', 'gap:4',
    {
      '@media (min-width: 640px)': {
        'flex-direction': 'row',
        'align-items': 'center',
      },
    },
  ],
});

// Produces correct CSS
expect(s.css).toContain('@media (min-width: 640px)');
expect(s.css).toContain('flex-direction: row');
expect(s.css).toContain('align-items: center');

// Mixed array form with CSS object elements
const s2 = css({
  card: [
    'p:4',
    { '&:hover': ['text:foreground', { 'background-color': 'rgba(0,0,0,0.3)' }] },
  ],
});

expect(s2.css).toContain('background-color: rgba(0,0,0,0.3)');
expect(s2.css).toContain('color: var(--color-foreground)');

// @ts-expect-error — old { property, value } shape no longer accepted
const _bad: StyleValue = { property: 'color', value: 'red' };
```

---

## Implementation Plan

### Phase 1: Core Runtime (packages/ui)

**Changes:**
- Remove `RawDeclaration` interface from `css.ts`
- Update `StyleValue` type: `string | Record<string, string>`
- Update `StyleEntry` type: `string | Record<string, StyleValue[] | Record<string, string>>`
- Update runtime processing in `css()` to handle new shapes:
  - Nested selector values can be arrays OR direct objects
  - Array elements can be strings OR `Record<string, string>` CSS declaration maps
- Update `serializeEntries()` for fingerprinting (sort keys for deterministic output)
- Remove `RawDeclaration` export from `public.ts`

**Acceptance criteria:**
```ts
describe('Given a css() call with direct object media query', () => {
  describe('When the media query value is Record<string, string>', () => {
    it('Then produces correct @media CSS rule', () => {});
  });
});

describe('Given a css() call with CSS object elements in arrays', () => {
  describe('When array contains Record<string, string> elements', () => {
    it('Then produces correct CSS declarations', () => {});
  });
});

describe('Given a css() call mixing shorthands and CSS objects in array', () => {
  describe('When array contains both strings and Record<string, string>', () => {
    it('Then produces both shorthand-resolved and raw CSS', () => {});
  });
});

describe('Given two css() calls with same declarations in different key order', () => {
  describe('When fingerprinting the entries', () => {
    it('Then produces the same class name (key-order-independent)', () => {});
  });
});
```

### Phase 2: Compiler (packages/ui-compiler)

**Changes:**
- `css-analyzer.ts`: Update `isStaticNestedObject()` to accept direct object values (not just arrays); rename `isStaticRawDeclaration()` → `isStaticCSSObject()` (any object literal with all string literal values)
- `css-transformer.ts`: Update `extractEntries()` to handle direct object values; update `extractRawDeclaration()` to extract all key-value pairs from an object (not just `property`/`value` keys)
- `extractor.ts`: Same updates as css-transformer.ts

**Acceptance criteria:**
```ts
describe('Given a static css() call with direct object form', () => {
  describe('When the compiler extracts CSS', () => {
    it('Then extracts correct @media rules from object values', () => {});
    it('Then classifies the call as static', () => {});
  });
});

describe('Given a css() call with CSS object in array', () => {
  describe('When the compiler extracts CSS', () => {
    it('Then extracts raw declarations from object entries', () => {});
  });
});
```

### Phase 3: Consumer Migration + Docs

**Changes:**
- All 10 landing page components: `{ property: 'x', value: 'y' }` → direct object form
- All theme-shadcn styles (~22 files including focusRing/disabledStyles/svgStyles patterns): same migration
- `_helpers.ts`: Change return types to specific object types (e.g. `{ animation: string }`)
- Update `focusRing`, `disabledStyles`, `svgStyles` type annotations across theme files
- Update `packages/mint-docs/api-reference/ui/css.mdx` to reflect new API shape

**Acceptance criteria:**
- All existing tests pass after migration
- `bun run typecheck` passes
- `bun run lint` passes
- Docs reflect the new API shape
