# Type-Safe CSS Utilities

**Issue:** #1455
**Status:** Design

## Problem

The `css()` and `variants()` utilities accept `string` arrays for class names via `StyleEntry = string | Record<...>`. Any string is accepted — typos like `'typo-that-doesnt-exist'` compile silently.

```ts
const styles = css({
  panel: ['bg:primary', 'p:6', 'typo-that-doesnt-exist'],  // no compile error
});
```

The compiler already has runtime diagnostics (`CSSDiagnostics`) that catch invalid tokens, but these only run during compilation — not during `tsc` type-checking. Developers don't get immediate feedback in their editor.

## API Surface

### Before

```ts
export type StyleValue = string | Record<string, string>;
export type StyleEntry = string | Record<string, StyleValue[] | Record<string, string>>;
```

### After

```ts
// New: constrained utility class union derived from token tables
export type UtilityClass =
  | KeywordClass          // 'flex', 'grid', 'hidden', ...
  | SpacingUtility        // 'p:4', 'mx:auto', 'gap:2', ...
  | ColorUtility          // 'bg:primary', 'text:muted.500', ...
  | SizeUtility           // 'w:full', 'h:screen', 'max-w:xl', ...
  | RadiusUtility         // 'rounded:lg', 'rounded:full', ...
  | ShadowUtility         // 'shadow:md', 'shadow:none', ...
  | FontSizeUtility       // 'font:xl', 'text:sm' (multi-mode)
  | FontWeightUtility     // 'weight:bold', 'font:medium' (multi-mode)
  | LineHeightUtility     // 'leading:tight', 'leading:loose', ...
  | AlignmentUtility      // 'items:center', 'justify:between', ...
  | ContentUtility        // 'content:empty', 'content:none'
  | RawUtility            // 'cursor:pointer', 'z:10', 'opacity:0.5', ...
  | PseudoUtility;        // 'hover:bg:primary', 'focus:outline-none', ...

// Updated: StyleEntry constrains strings to UtilityClass
export type StyleEntry = UtilityClass | Record<string, StyleValue[] | Record<string, string>>;

// StyleValue also constrained in nested contexts
export type StyleValue = UtilityClass | Record<string, string>;
```

### Usage — invalid class names rejected

```ts
const styles = css({
  panel: ['bg:primary', 'p:6', 'typo-that-doesnt-exist'],
  //                           ^^^^^^^^^^^^^^^^^^^^^^^^^ Error!
  // Type '"typo-that-doesnt-exist"' is not assignable to type 'UtilityClass | Record<...>'
});
```

### Usage — autocomplete works

```ts
const styles = css({
  panel: ['bg:' /* autocomplete shows: primary, secondary, muted, ... */],
  //      'p:'  /* autocomplete shows: 0, 1, 2, 4, 6, 8, ... */
  //      'rou' /* autocomplete shows: rounded:lg, rounded:md, ... */
});
```

### Usage — raw-value properties still accept any string value

```ts
// These properties accept arbitrary CSS values (escape hatch)
const styles = css({
  box: [
    'cursor:pointer',         // Known value — autocomplete
    'cursor:not-allowed',     // Unknown value — still valid (raw property)
    'z:10',                   // Any string for z-index
    'opacity:0.5',            // Any string for opacity
    'transition:colors',      // Known alias — autocomplete
    'transition:all 200ms',   // Arbitrary value — still valid
  ],
});
```

## Approach: Template Literal Types from Token Tables

### Step 1: Convert token tables to `satisfies`

Change `PROPERTY_MAP`, `KEYWORD_MAP`, `SPACING_SCALE`, etc. from `Record<string, X>` to `{ ... } as const satisfies Record<string, X>`. This preserves literal key types while maintaining value type safety.

```ts
// Before:
export const KEYWORD_MAP: Record<string, CSSDeclarationEntry[]> = { flex: [...], ... };
// keyof typeof KEYWORD_MAP === string  ❌

// After:
export const KEYWORD_MAP = { flex: [...], ... } as const satisfies Record<string, CSSDeclarationEntry[]>;
// keyof typeof KEYWORD_MAP === 'flex' | 'grid' | 'block' | ...  ✅
```

### Step 2: Derive utility types from token table keys

In a new file `packages/ui/src/css/utility-types.ts`:

```ts
import type {
  ALIGNMENT_MAP, COLOR_NAMESPACES, CONTENT_MAP, CSS_COLOR_KEYWORDS,
  FONT_SIZE_SCALE, FONT_WEIGHT_SCALE, KEYWORD_MAP, LINE_HEIGHT_SCALE,
  PROPERTY_MAP, PSEUDO_MAP, RADIUS_SCALE, SHADOW_SCALE, SIZE_KEYWORDS,
  SPACING_SCALE,
} from './token-tables';

// ─── Key extraction ──────────────────────────
type Keyword = keyof typeof KEYWORD_MAP;
type SpacingValue = keyof typeof SPACING_SCALE;
type RadiusValue = keyof typeof RADIUS_SCALE;
type ShadowValue = keyof typeof SHADOW_SCALE;
type FontSizeValue = keyof typeof FONT_SIZE_SCALE;
type FontWeightValue = keyof typeof FONT_WEIGHT_SCALE;
type LineHeightValue = keyof typeof LINE_HEIGHT_SCALE;
type AlignmentValue = keyof typeof ALIGNMENT_MAP;
type SizeValue = keyof typeof SIZE_KEYWORDS | SpacingValue | 'screen';
type ContentValue = keyof typeof CONTENT_MAP;
type ColorNamespace = keyof typeof COLOR_NAMESPACES extends never
  ? /* Set → iterate manually */ ColorNamespaceManual
  : never;
type CSSColorKeyword = /* from CSS_COLOR_KEYWORDS Set */ CSSColorKeywordManual;
type PseudoPrefix = keyof typeof PSEUDO_MAP;
type ColorShade = '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950';

// ─── Color tokens ────────────────────────────
type ColorToken = ColorNamespace | `${ColorNamespace}.${ColorShade}` | CSSColorKeyword;

// ─── Property groups (by valueType) ──────────
// Extract property names by their valueType from PROPERTY_MAP
type PropertiesOfType<T extends string> = {
  [K in keyof typeof PROPERTY_MAP]: (typeof PROPERTY_MAP)[K]['valueType'] extends T ? K : never;
}[keyof typeof PROPERTY_MAP];

type SpacingProperty = PropertiesOfType<'spacing'>;  // 'p' | 'px' | 'py' | ... | 'gap'
type ColorProperty = PropertiesOfType<'color'>;       // 'bg' | 'text' | 'border'  (but text/border are multi-mode)
type SizeProperty = PropertiesOfType<'size'>;          // 'w' | 'h' | 'min-w' | ...
type RadiusProperty = PropertiesOfType<'radius'>;      // 'rounded'
type ShadowProperty = PropertiesOfType<'shadow'>;      // 'shadow'
type FontSizeProperty = PropertiesOfType<'font-size'>; // 'font'  (but font is multi-mode)
type FontWeightProperty = PropertiesOfType<'font-weight'>; // 'weight'
type LineHeightProperty = PropertiesOfType<'line-height'>; // 'leading'
type AlignmentProperty = PropertiesOfType<'alignment'>;    // 'items' | 'justify'
type ContentProperty = PropertiesOfType<'content'>;        // 'content'
type RawProperty = PropertiesOfType<'raw'>;                // 'cursor' | 'transition' | 'z' | ...
type RingProperty = PropertiesOfType<'ring'>;              // 'ring'

// ─── Utility class union ─────────────────────
type SpacingUtility = `${SpacingProperty}:${SpacingValue}`;
type ColorUtility = `${ColorProperty}:${ColorToken}`;
type SizeUtility = `${SizeProperty}:${SizeValue}`;
type RadiusUtility = `${RadiusProperty}:${RadiusValue}`;
type ShadowUtility = `${ShadowProperty}:${ShadowValue}`;
type FontSizeUtility = `${FontSizeProperty}:${FontSizeValue | FontWeightValue}`; // font is multi-mode
type FontWeightUtility = `${FontWeightProperty}:${FontWeightValue}`;
type LineHeightUtility = `${LineHeightProperty}:${LineHeightValue}`;
type AlignmentUtility = `${AlignmentProperty}:${AlignmentValue}`;
type ContentUtility = `${ContentProperty}:${ContentValue}`;
type RawUtility = `${RawProperty}:${string}`;  // escape hatch: any value
type RingUtility = `${RingProperty}:${string}`; // ring accepts numbers or colors

// Multi-mode: text accepts font sizes, alignment keywords, AND colors
type TextUtility = `text:${FontSizeValue | TextAlignKeyword | ColorToken}`;
// Multi-mode: border accepts numbers AND colors
type BorderWidthUtility = `border:${number}`;

type TextAlignKeyword = 'center' | 'left' | 'right' | 'justify' | 'start' | 'end';
type ListKeyword = 'none' | 'disc' | 'decimal' | 'inside' | 'outside';
type ListUtility = `list:${ListKeyword}`;

// Pseudo-prefixed variants
type BaseUtility =
  | Keyword
  | SpacingUtility | ColorUtility | SizeUtility | RadiusUtility
  | ShadowUtility | FontSizeUtility | FontWeightUtility | LineHeightUtility
  | AlignmentUtility | ContentUtility | RawUtility | RingUtility
  | TextUtility | ListUtility;

type PseudoUtility = `${PseudoPrefix}:${BaseUtility}`;

export type UtilityClass = BaseUtility | PseudoUtility;
```

### Step 3: Handle COLOR_NAMESPACES and CSS_COLOR_KEYWORDS Sets

`COLOR_NAMESPACES` and `CSS_COLOR_KEYWORDS` are `ReadonlySet<string>`, which erases the literal types. Two options:

**Option A: Convert Sets to `as const` arrays + derive Set at runtime**
```ts
const COLOR_NAMESPACE_LIST = ['primary', 'secondary', ...] as const;
export type ColorNamespace = (typeof COLOR_NAMESPACE_LIST)[number];
export const COLOR_NAMESPACES: ReadonlySet<string> = new Set(COLOR_NAMESPACE_LIST);
```

**Option B: Keep Sets, add a parallel type**
```ts
export const COLOR_NAMESPACES: ReadonlySet<string> = new Set([...]);
// Manually kept in sync:
export type ColorNamespace = 'primary' | 'secondary' | 'accent' | ...;
```

**Decision: Option A** — single source of truth, no manual sync.

### Step 4: Update StyleEntry and StyleValue

```ts
export type StyleValue = UtilityClass | Record<string, string>;
export type StyleEntry = UtilityClass | Record<string, StyleValue[] | Record<string, string>>;
```

### Step 5: `s()` inline styles

The `s()` function accepts `string[]` for inline styles. It should use the same `UtilityClass` type (minus pseudo-prefixed utilities, since pseudo-states don't work inline). This is a nice-to-have and can be deferred.

## Manifesto Alignment

- **Principle 1: Developer-first DX** — Autocomplete and compile-time errors are a significant DX improvement. Developers get immediate feedback on typos and invalid tokens.
- **Principle 4: No magic** — Types are derived directly from the token tables (the single source of truth). No hidden codegen step.
- **Principle 7: LLM-friendly** — Constrained types help LLMs generate correct code. The union provides the complete vocabulary of valid tokens.

## Non-Goals

- **Custom theme tokens in the union** — User-defined tokens (via `defineTheme`) won't be included in the base `UtilityClass` type. This would require codegen per-project. Can be added later via declaration merging.
- **Exhaustive shade validation** — We don't validate that `primary.950` actually exists in the user's theme. We validate the namespace and allow the standard shade scale. The runtime/compiler already catches this.
- **csstype integration** — We won't type-check the values inside `Record<string, string>` object syntax against `csstype`. This is a separate concern and would add a dependency.
- **`s()` function** — Not in scope for this PR. Can be done as a follow-up.

## Unknowns

1. **TypeScript performance with the full union** — Template literal types with cross products can slow down the type checker. Need to benchmark with realistic codebase size (~50 files using `css()`).
   - **Resolution:** POC in Phase 1 — measure `tsc` time before and after on the actual codebase.
   - **Mitigation:** If perf is unacceptable, fall back to a smaller union (no pseudo cross-product, use `${PseudoPrefix}:${string}` instead).

2. **`as const satisfies` on KEYWORD_MAP/PROPERTY_MAP** — These maps have complex value types (`CSSDeclarationEntry[]`, `PropertyMapping`). Need to verify `as const` doesn't make the value types overly narrow (e.g., readonly tuples where mutable arrays are expected).
   - **Resolution:** Test in Phase 1.

## Type Flow Map

```
token-tables.ts (KEYWORD_MAP, PROPERTY_MAP, SPACING_SCALE, ...)
  ↓ keyof typeof (preserved via `satisfies`)
utility-types.ts (UtilityClass union type)
  ↓ used in
css.ts (StyleEntry = UtilityClass | Record<...>)
  ↓ used in
variants.ts (VariantsConfig.base, variant StyleEntry arrays)
  ↓ consumed by
theme-shadcn/src/styles/*.ts (all theme style definitions)
  ↓ consumed by
user app code (css(), variants() calls)
```

Dead generic check: No generics introduced. All types are concrete unions.

## E2E Acceptance Test

```ts
// ✅ Valid utilities compile
const valid = css({
  card: ['p:4', 'bg:primary', 'rounded:lg', 'hover:bg:primary.700'],
});

// ✅ Raw-value properties accept any string
const raw = css({
  box: ['cursor:pointer', 'z:10', 'opacity:0.5', 'transition:colors'],
});

// ✅ Object syntax still works
const obj = css({
  card: ['p:4', { '&:hover': ['bg:primary', { 'text-decoration': 'underline' }] }],
});

// ❌ Invalid utility rejected
css({
  card: [
    // @ts-expect-error — 'typo-that-doesnt-exist' is not a valid utility class
    'typo-that-doesnt-exist',
  ],
});

// ❌ Invalid property rejected
css({
  card: [
    // @ts-expect-error — 'bgg' is not a valid property shorthand
    'bgg:primary',
  ],
});

// ❌ Invalid spacing value rejected
css({
  card: [
    // @ts-expect-error — '999' is not a valid spacing value
    'p:999',
  ],
});

// ❌ Invalid color token rejected (for typed color properties)
css({
  card: [
    // @ts-expect-error — 'nonexistent' is not a valid color token
    'bg:nonexistent',
  ],
});

// ✅ Pseudo-prefixed utilities valid
css({
  card: ['hover:bg:primary.700', 'focus:outline-none', 'disabled:opacity:0.5'],
});

// ❌ Invalid pseudo prefix rejected
css({
  card: [
    // @ts-expect-error — 'hoverr' is not a valid pseudo prefix
    'hoverr:bg:primary',
  ],
});
```

## Implementation Plan

### Phase 1: Token table type preservation + utility type derivation

**Changes:**
1. Convert `PROPERTY_MAP`, `KEYWORD_MAP`, and all scale maps in `token-tables.ts` to use `satisfies` instead of explicit type annotations
2. Convert `COLOR_NAMESPACES`, `CSS_COLOR_KEYWORDS`, `PSEUDO_PREFIXES` from opaque `Set<string>` to const arrays + derived Sets
3. Create `utility-types.ts` with the full `UtilityClass` union type
4. Update `StyleEntry` and `StyleValue` types in `css.ts` to use `UtilityClass`
5. Update the `css.test-d.ts` type tests with positive and negative cases
6. Benchmark TypeScript performance

**Acceptance criteria:**
- `tsc` rejects invalid utility class names
- `tsc` accepts all existing valid utility class names in the codebase
- All existing tests pass without changes
- TypeScript performance regression < 20% on full monorepo typecheck
- Export `UtilityClass` type from `@vertz/ui` public API

### Phase 2: Propagate to variants() and theme-shadcn

**Changes:**
1. Verify `VariantsConfig` type flows correctly with constrained `StyleEntry`
2. Verify all `theme-shadcn/src/styles/*.ts` files compile with the new types
3. Fix any type errors in theme styles (these would be real bugs caught by the new types)
4. Add changeset

**Acceptance criteria:**
- All theme style files compile without errors or suppressions
- `bun run typecheck` passes across the full monorepo
- Any type errors found in theme styles are genuine bugs (fixed, not suppressed)
