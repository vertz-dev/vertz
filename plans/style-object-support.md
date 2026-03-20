# Style Object Support

> Support React-style `style` objects with camelCase properties alongside string styles.
> Issue: #1332

## API Surface

### Developer-facing usage

```tsx
// String styles (existing — unchanged)
<div style="background-color: red; margin-top: 1rem">

// Object styles with camelCase properties (new)
<div style={{ backgroundColor: 'red', marginTop: '1rem' }}>

// Numeric values auto-append px for dimensional properties
<div style={{ width: 200, opacity: 0.5 }}>
// → style="width: 200px; opacity: 0.5"

// Zero values NEVER get px, regardless of property
<div style={{ margin: 0, opacity: 0 }}>
// → style="margin: 0; opacity: 0"

// Vendor prefixes
<div style={{ WebkitTransform: 'rotate(45deg)', MozTransform: 'rotate(45deg)' }}>
// → style="-webkit-transform: rotate(45deg); -moz-transform: rotate(45deg)"

// ms prefix (lowercase in camelCase, unlike Webkit/Moz)
<div style={{ msTransform: 'rotate(45deg)' }}>
// → style="-ms-transform: rotate(45deg)"

// CSS custom properties (no auto-px, even for numeric values)
<div style={{ '--my-color': 'red', '--grid-columns': 3 }}>
// → style="--my-color: red; --grid-columns: 3"

// Reactive style objects
let bg = 'red';
<div style={{ backgroundColor: bg }}>
// Reactively updates when bg changes

// null/undefined values are skipped
<div style={{ color: 'red', backgroundColor: undefined }}>
// → style="color: red"
```

### Output format

CSS string uses `: ` between property and value, `; ` between declarations, no trailing semicolon. Example: `"background-color: red; margin-top: 1rem"`.

### Invalid input behavior

```tsx
// Non-plain-object, non-string values: dev mode console.warn, fallback to String()
<div style={42}>           // ⚠ warns in dev, sets style="42"
<div style={[1, 2]}>       // ⚠ warns in dev, sets style="1,2"
<div style={new Map()}>     // ⚠ warns in dev, sets style="[object Map]"

// null/undefined: attribute not set (same as current behavior)
<div style={null}>          // no style attribute
<div style={undefined}>     // no style attribute
```

### TypeScript types

```tsx
// CSSProperties type — derived from CSSStyleDeclaration, zero dependencies
// Uses a mapped type that extracts string-valued properties from CSSStyleDeclaration,
// filtering out methods (getPropertyValue, item, etc.) and non-string properties (length, parentRule).
// The Extract<keyof CSSStyleDeclaration, string> filters out numeric index signatures.
type CSSPropertyName = {
  [K in Extract<keyof CSSStyleDeclaration, string>]:
    CSSStyleDeclaration[K] extends string ? K : never;
}[Extract<keyof CSSStyleDeclaration, string>];

type CSSProperties = {
  [K in CSSPropertyName]?: string | number;
} & {
  [key: `--${string}`]: string | number; // CSS custom properties
};

// style prop accepts string | CSSProperties
// The explicit `style` property takes precedence over the [key: string]: unknown
// index signature in TypeScript's type resolution, enabling proper type checking
// and autocomplete for style values.
interface HTMLAttributes {
  [key: string]: unknown;
  children?: unknown;
  style?: string | CSSProperties;
}
```

**Note on type derivation**: `CSSStyleDeclaration` comes from `lib.dom.d.ts` and varies by TypeScript version. Since it's a mapped type (not a snapshot), the `CSSProperties` type automatically stays current with whatever TS version the developer uses. New CSS properties added to `lib.dom.d.ts` in future TS releases will automatically appear in autocomplete.

### Internal utility

```tsx
import { styleObjectToString } from '@vertz/ui/dom/style';

// Converts a CSSProperties object to a CSS string
styleObjectToString({ backgroundColor: 'red', marginTop: '1rem' });
// → "background-color: red; margin-top: 1rem"

styleObjectToString({ width: 200, opacity: 0.5 });
// → "width: 200px; opacity: 0.5"

styleObjectToString({ WebkitTransform: 'rotate(45deg)' });
// → "-webkit-transform: rotate(45deg)"

styleObjectToString({ msTransform: 'rotate(45deg)' });
// → "-ms-transform: rotate(45deg)"
```

### camelCase to kebab-case conversion

The conversion algorithm:

1. **`ms` prefix special case**: If the property starts with `ms` (lowercase), prepend `-` before converting. React does this because `msTransform` should become `-ms-transform`, not `ms-transform`. Other vendor prefixes (`Webkit`, `Moz`, `O`) start uppercase so the standard regex handles them naturally (e.g., `WebkitTransform` → `-webkit-transform`).

2. **Standard conversion**: Replace each uppercase letter with `-` + lowercase. Example: `backgroundColor` → `background-color`.

3. **CSS custom properties**: Properties starting with `--` are passed through as-is (no conversion).

### Unitless properties

Numeric values get `px` appended by default. The following properties are **unitless** (no `px` suffix) — this matches React's behavior:

```
animationIterationCount, aspectRatio, borderImageOutset, borderImageSlice,
borderImageWidth, boxFlex, boxFlexGroup, boxOrdinalGroup, columnCount,
columns, flex, flexGrow, flexPositive, flexShrink, flexNegative, flexOrder,
gridArea, gridRow, gridRowEnd, gridRowSpan, gridRowStart, gridColumn,
gridColumnEnd, gridColumnSpan, gridColumnStart, fontWeight, lineClamp,
lineHeight, opacity, order, orphans, tabSize, widows, zIndex, zoom,
fillOpacity, floodOpacity, stopOpacity, strokeDasharray, strokeDashoffset,
strokeMiterlimit, strokeOpacity, strokeWidth
```

**Rules:**
- Numeric `0` NEVER gets `px`, regardless of property (`margin: 0` not `margin: 0px`)
- CSS custom properties (`--*`) NEVER get `px` appended (matching React behavior)
- String values are always used as-is, never get `px`

## Manifesto Alignment

### Principle 3: AI agents are first-class users
This feature exists specifically because LLMs generate `style={{ backgroundColor: 'red' }}` by default (trained on React). Making this "just work" reduces LLM iteration tax to zero for style attributes.

### Principle 1: If it builds, it works
Object styles are type-checked at compile time — TypeScript catches typos in property names and invalid value types. String styles can't offer this. The `CSSProperties` type provides autocomplete and validation.

### Principle 2: One way to do things
**This feature deliberately accepts two syntaxes in service of Principles 1 and 3.** The string form is native HTML (can't reject it), the object form is what LLMs/React devs generate. This is a ranked priority decision: LLM-first (Principle 3) and type safety (Principle 1) outweigh single-syntax purity (Principle 2) here. Both forms produce identical DOM output, so the behavior is unambiguous — only the syntax differs.

**Precedent bar:** Future features should NOT use this as blanket justification for alternative syntax. The bar is: you need both an LLM-compatibility AND a native-platform-compatibility argument this strong.

### Tradeoffs accepted
- **Two ways to write styles** — justified by LLM-first + native HTML compatibility, as argued above
- **Runtime overhead for object styles** — camelCase → kebab-case conversion at runtime; negligible for inline styles (typically 1-5 properties)

### What was rejected
- **CSS-in-JS / styled-components approach** — Too much API surface, doesn't match the issue scope
- **Compile-time only conversion** — Would leave the JSX runtime (tests/dev) broken for object styles
- **External `csstype` dependency** — Can derive types from browser's `CSSStyleDeclaration` with zero deps
- **Per-property `el.style.setProperty()` instead of `setAttribute`** — Would avoid the `__show` interaction (see Known Limitations) but adds complexity (need to track/remove previous properties on reactive updates). `setAttribute` is simpler and matches how string styles already work.

## Non-Goals

- **CSS-in-JS runtime** — No `styled()` API, no dynamic class generation
- **Theming through style objects** — Theme tokens stay in `css()` / `variants()`, not inline styles
- **Compile-time style optimization** — Converting static object literals to strings at compile time is a future optimization, not required for this feature
- **Style merging/composition** — No `mergeStyles()` utility; developers handle that themselves
- **Typed values for specific properties** — `CSSProperties` allows `string | number` for all properties, not narrowed types like `color: 'red' | 'blue'`
- **Fixing `__show` + reactive style interaction** — Pre-existing issue, tracked separately (see Known Limitations)
- **Consolidating `camelToKebab` implementations** — Three existing implementations in the codebase (`ssr-element.ts`, `global-css.ts`, SSR style proxy). The new utility in `dom/style.ts` adds a fourth. Consolidation is desirable but out of scope — it touches unrelated packages and would bloat this PR. Can be a follow-up chore.

## Known Limitations

### `__show()` + reactive style interaction (pre-existing)

`__show()` uses `el.style.display = 'none'` while reactive style binding uses `el.setAttribute('style', cssString)`. `setAttribute` replaces the entire inline style, clobbering `display: none` from `__show()`. Example:

```tsx
<div style={{ backgroundColor: bg }} v-show={visible}>
// If __attr fires after __show, it clears display: none
```

**This is a pre-existing issue** — string reactive styles (`style={someReactiveString}`) have the same conflict. This feature does not make it worse. The fix (per-property `el.style.setProperty()` or style merging) is a separate concern and should be tracked as its own issue.

## Unknowns

None identified. All touch points are well-understood, and the SSR codebase already has camelCase → kebab-case conversion as prior art.

## POC Results

No POC needed. The SSR DOM shim (`createStyleProxy` in `ssr-element.ts`) already implements camelCase → kebab-case conversion for `el.style.prop = value`. The same algorithm works for batch object conversion.

## Type Flow Map

```
CSSProperties (type def in packages/ui/src/jsx-runtime/css-properties.ts)
  ↓
  Derived from CSSStyleDeclaration via mapped type (Extract<keyof, string> → filter extends string)
  ↓
JSX.HTMLAttributes['style'] = string | CSSProperties
  ↓ (explicit property takes precedence over [key: string]: unknown index signature)
Developer writes: <div style={{ backgroundColor: 'red' }}>
  ↓
TypeScript validates: CSSProperties keys autocomplete, excess property check catches typos
  ↓
Runtime: styleObjectToString() converts to CSS string
  ↓
DOM: element.setAttribute('style', 'background-color: red')
```

No generics involved. The only type parameter is the mapped type over `CSSStyleDeclaration` keys, which is resolved at compile time.

## E2E Acceptance Test

```tsx
describe('Feature: React-style object styles', () => {
  describe('Given a JSX element with an object style prop', () => {
    describe('When rendering <div style={{ backgroundColor: "red", marginTop: "1rem" }}>', () => {
      it('Then the element has style="background-color: red; margin-top: 1rem"', () => {
        const el = <div style={{ backgroundColor: 'red', marginTop: '1rem' }} />;
        expect(el.getAttribute('style')).toBe('background-color: red; margin-top: 1rem');
      });
    });
  });

  describe('Given numeric values for dimensional properties', () => {
    describe('When rendering <div style={{ width: 200, opacity: 0.5 }}>', () => {
      it('Then width gets px suffix and opacity does not', () => {
        const el = <div style={{ width: 200, opacity: 0.5 }} />;
        expect(el.getAttribute('style')).toBe('width: 200px; opacity: 0.5');
      });
    });
  });

  describe('Given zero values', () => {
    describe('When rendering <div style={{ margin: 0 }}>', () => {
      it('Then outputs margin: 0 without px suffix', () => {
        const el = <div style={{ margin: 0 }} />;
        expect(el.getAttribute('style')).toBe('margin: 0');
      });
    });
  });

  describe('Given a string style prop', () => {
    describe('When rendering <div style="color: red">', () => {
      it('Then the element has style="color: red" (backward compatible)', () => {
        const el = <div style="color: red" />;
        expect(el.getAttribute('style')).toBe('color: red');
      });
    });
  });

  describe('Given vendor-prefixed properties', () => {
    describe('When rendering <div style={{ WebkitTransform: "rotate(45deg)" }}>', () => {
      it('Then converts to -webkit-transform', () => {
        const el = <div style={{ WebkitTransform: 'rotate(45deg)' }} />;
        expect(el.getAttribute('style')).toBe('-webkit-transform: rotate(45deg)');
      });
    });
    describe('When rendering <div style={{ msTransform: "rotate(45deg)" }}>', () => {
      it('Then converts to -ms-transform (lowercase ms gets leading dash)', () => {
        const el = <div style={{ msTransform: 'rotate(45deg)' }} />;
        expect(el.getAttribute('style')).toBe('-ms-transform: rotate(45deg)');
      });
    });
  });

  // Type-level tests
  // @ts-expect-error — style object should not accept non-CSS properties
  <div style={{ notACSSProperty: 'value' }} />;

  // @ts-expect-error — style should not accept a number directly
  <div style={42} />;

  // Valid — string style
  <div style="color: red" />;

  // Valid — object style with camelCase
  <div style={{ backgroundColor: 'red' }} />;
```

## Implementation Plan

### Phase 1: Core utility + types + JSX runtimes (thinnest E2E slice)

Create the `styleObjectToString()` utility, `CSSProperties` type, and wire into both JSX runtimes so that object styles work in tests/dev with full type safety.

**Deliverables:**
- `packages/ui/src/dom/style.ts` — `styleObjectToString()` with:
  - camelCase → kebab-case conversion
  - `ms` prefix special case (`msTransform` → `-ms-transform`)
  - Auto-px for numeric values (except unitless properties, zero, and custom properties)
  - null/undefined value skipping
  - Dev-mode `console.warn` for non-plain-object, non-string style values
- `packages/ui/src/jsx-runtime/css-properties.ts` — `CSSProperties` type derived from `CSSStyleDeclaration`
- `packages/ui/src/jsx-runtime/index.ts` — `HTMLAttributes.style` typed as `string | CSSProperties`; `jsxImpl()` detects object style and converts
- `packages/ui/src/jsx-runtime.ts` — (second JSX runtime) same object detection and conversion
- Export `styleObjectToString` and `CSSProperties` from `packages/ui/src/dom/index.ts`

**Acceptance criteria:**
```tsx
describe('Phase 1: styleObjectToString utility', () => {
  describe('Given an object with camelCase CSS properties', () => {
    it('Then converts to kebab-case CSS string', () => {
      expect(styleObjectToString({ backgroundColor: 'red' })).toBe('background-color: red');
    });
  });

  describe('Given multiple properties', () => {
    it('Then joins with semicolon and space', () => {
      expect(styleObjectToString({ backgroundColor: 'red', marginTop: '1rem' }))
        .toBe('background-color: red; margin-top: 1rem');
    });
  });

  describe('Given numeric values', () => {
    it('Then appends px for dimensional properties', () => {
      expect(styleObjectToString({ width: 200 })).toBe('width: 200px');
    });
    it('Then does NOT append px for unitless properties', () => {
      expect(styleObjectToString({ opacity: 0.5 })).toBe('opacity: 0.5');
    });
    it('Then does NOT append px for zero values', () => {
      expect(styleObjectToString({ margin: 0 })).toBe('margin: 0');
    });
  });

  describe('Given vendor-prefixed properties', () => {
    it('Then converts WebkitX to -webkit-x', () => {
      expect(styleObjectToString({ WebkitTransform: 'rotate(45deg)' }))
        .toBe('-webkit-transform: rotate(45deg)');
    });
    it('Then converts msX to -ms-x (special case for lowercase ms)', () => {
      expect(styleObjectToString({ msTransform: 'rotate(45deg)' }))
        .toBe('-ms-transform: rotate(45deg)');
    });
  });

  describe('Given CSS custom properties', () => {
    it('Then passes through as-is', () => {
      expect(styleObjectToString({ '--my-color': 'red' })).toBe('--my-color: red');
    });
    it('Then does NOT append px for numeric values', () => {
      expect(styleObjectToString({ '--grid-columns': 3 })).toBe('--grid-columns: 3');
    });
  });

  describe('Given null/undefined values', () => {
    it('Then skips those properties', () => {
      expect(styleObjectToString({ color: 'red', background: undefined }))
        .toBe('color: red');
    });
  });
});

describe('Phase 1: JSX runtime with object styles', () => {
  describe('Given object style in JSX', () => {
    it('Then element has correct CSS string as style attribute', () => {
      const el = jsx('div', { style: { backgroundColor: 'red', marginTop: '1rem' } });
      expect(el.getAttribute('style')).toBe('background-color: red; margin-top: 1rem');
    });
  });

  describe('Given string style in JSX (backward compat)', () => {
    it('Then element has the string as-is', () => {
      const el = jsx('div', { style: 'color: red' });
      expect(el.getAttribute('style')).toBe('color: red');
    });
  });
});

describe('Phase 1: CSSProperties type', () => {
  // Positive: valid CSS properties accepted
  const validStyle: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };

  // Positive: custom properties accepted
  const customProps: CSSProperties = { '--my-color': 'red' };

  // Positive: numeric values accepted
  const numericStyle: CSSProperties = { width: 200 };

  // @ts-expect-error — boolean values not accepted
  const badValue: CSSProperties = { width: true };
});
```

### Phase 2: `__attr()` reactive style + compiler support

Wire object style support into the production code path: reactive `__attr()` and compiler's `processAttribute()`.

**Depends on:** Phase 1 (utility function)

**Deliverables:**
- `packages/ui/src/dom/attributes.ts` — `__attr()` signature widened to accept object values for style:
  ```ts
  // Before:
  fn: () => string | boolean | null | undefined
  // After:
  fn: () => string | boolean | Record<string, string | number> | null | undefined
  ```
  When `name === 'style'` and `typeof value === 'object'`, calls `styleObjectToString(value)`.
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — `processAttribute()` handles `style` specially:
  - Static string literal: unchanged (`el.setAttribute('style', "...")`)
  - Static object expression (non-reactive): wraps in `__styleStr(exprText)` (imported utility)
  - Reactive expression: `__attr(el, 'style', () => expr)` (relies on `__attr`'s object detection)
- Import `styleObjectToString` (aliased as `__styleStr`) in compiler output when needed

**Acceptance criteria:**
```tsx
describe('Phase 2: __attr with object style', () => {
  describe('Given a reactive object style binding', () => {
    it('Then setAttribute receives the converted CSS string', () => {
      const el = document.createElement('div');
      const bg = signal('red');
      __attr(el, 'style', () => ({ backgroundColor: bg.value }));
      expect(el.getAttribute('style')).toBe('background-color: red');
      bg.value = 'blue';
      expect(el.getAttribute('style')).toBe('background-color: blue');
    });
  });

  describe('Given a reactive string style binding', () => {
    it('Then setAttribute receives the string as-is (backward compat)', () => {
      const el = document.createElement('div');
      const color = signal('red');
      __attr(el, 'style', () => `color: ${color.value}`);
      expect(el.getAttribute('style')).toBe('color: red');
    });
  });
});

describe('Phase 2: Compiler style attribute handling', () => {
  describe('Given style={{ backgroundColor: "red" }} (static object) in JSX', () => {
    it('Then compiled output wraps in styleObjectToString', () => {
      // Compiler transform test verifying output contains __styleStr({ ... })
    });
  });

  describe('Given style={reactiveObj} (reactive) in JSX', () => {
    it('Then compiled output uses __attr with style name', () => {
      // Compiler transform test verifying output contains __attr(el, "style", ...)
    });
  });

  describe('Given style="color: red" (static string) in JSX', () => {
    it('Then compiled output uses setAttribute directly (unchanged)', () => {
      // Compiler transform test verifying no styleObjectToString wrapper
    });
  });
});
```

### Phase 3: SSR support

Ensure object styles serialize correctly during server-side rendering.

**Depends on:** Phase 1 (utility function)

**Deliverables:**
- `packages/ui-server/src/dom-shim/ssr-element.ts`:
  - `setAttribute` signature widened: `(name: string, value: string | Record<string, string | number>): void`
  - When `name === 'style'` and `typeof value === 'object'`, converts via `styleObjectToString` and also populates the style proxy's internal map (so that subsequent `el.style.display = 'none'` from `__show` doesn't overwrite with empty styles)
  - String style values continue to work as-is
- Import `styleObjectToString` from `@vertz/ui`

**Acceptance criteria:**
```tsx
describe('Phase 3: SSR object style serialization', () => {
  describe('Given an SSR element with setAttribute("style", object)', () => {
    it('Then attrs.style contains the converted CSS string', () => {
      const el = new SSRElement('div');
      el.setAttribute('style', { backgroundColor: 'red', marginTop: '1rem' });
      expect(el.attrs.style).toBe('background-color: red; margin-top: 1rem');
    });
  });

  describe('Given an SSR element with setAttribute("style", string)', () => {
    it('Then attrs.style contains the string as-is (backward compat)', () => {
      const el = new SSRElement('div');
      el.setAttribute('style', 'color: red');
      expect(el.attrs.style).toBe('color: red');
    });
  });

  describe('Given setAttribute("style", object) followed by el.style.display = "none"', () => {
    it('Then attrs.style contains both the object styles and display: none', () => {
      const el = new SSRElement('div');
      el.setAttribute('style', { backgroundColor: 'red' });
      el.style.display = 'none';
      expect(el.attrs.style).toContain('background-color: red');
      expect(el.attrs.style).toContain('display: none');
    });
  });
});
```

## Post-Migration Note (2026-03-20)

All first-party code (examples, ui-primitives, ui-auth, icons, theme-shadcn, landing site) now uses camelCase style objects exclusively. String styles are still accepted by the runtime for backward compatibility, but all framework code, examples, and primitives use objects. See `plans/camelcase-style-migration.md` for the full migration plan.
