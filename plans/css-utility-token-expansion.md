# CSS Utility Token Expansion

**Issue:** [#1566](https://github.com/vertz-dev/vertz/issues/1566)
**Status:** Draft
**Package:** `@vertz/ui`, `@vertz/ui-compiler`

---

## Problem

Issue #1513 exposed gaps in the CSS token system. Developers reaching for standard Tailwind-like patterns hit silent failures or `TokenResolveError` — poor DX. The four most common missing patterns are:

1. Color opacity modifiers (`bg:primary/50`)
2. Overflow axis variants (`overflow-x:auto`)
3. Fraction dimensions (`w:1/2`)
4. Transform keywords (`scale-110`)

## API Surface

### 1. Color Opacity Modifier

```ts
// Shorthand syntax: <color-property>:<color-token>/<opacity-0-to-100>
css({
  panel: ['bg:primary/50'],         // → background-color: color-mix(in oklch, var(--color-primary) 50%, transparent)
  overlay: ['bg:background/80'],    // → background-color: color-mix(in oklch, var(--color-background) 80%, transparent)
  border: ['border:ring/30'],       // → border-color: color-mix(in oklch, var(--color-ring) 30%, transparent)
  text: ['text:muted/90'],          // → color: color-mix(in oklch, var(--color-muted) 90%, transparent)
  shade: ['bg:primary.700/50'],     // → background-color: color-mix(in oklch, var(--color-primary-700) 50%, transparent)
});

// @ts-expect-error — invalid opacity (not 0-100)
css({ x: ['bg:primary/200'] });
// @ts-expect-error — invalid color namespace with opacity
css({ x: ['bg:potato/50'] });
```

**Resolution rule:** In `resolveColor()`, detect `/N` suffix before other checks. Split on the last `/`, resolve the color token part normally to get a CSS variable, then wrap in `color-mix(in oklch, var(...) N%, transparent)`. The opacity value `N` is an integer 0–100 and maps directly to the `color-mix` percentage.

**Multi-mode resolver routing:** No special handling needed. `resolveText()` falls through to `resolveColor()` for any value that isn't a font-size or text-align keyword, so `muted/90` routes correctly. Similarly, `resolveBorder()` tries `Number('ring/30')` which is NaN, and falls through to `resolveColor()`. `resolveRingMulti()` does the same. The correctness relies on `Number('X/Y')` returning NaN for any string containing `/` — this is a safe invariant of JavaScript's `Number()`.

### 2. Overflow Axis Variants

```ts
css({
  panel: [
    'overflow:auto',      // → overflow: auto
    'overflow:scroll',    // → overflow: scroll
    'overflow:visible',   // → overflow: visible
    'overflow:hidden',    // → overflow: hidden
  ],
  scroll: [
    'overflow-x:auto',   // → overflow-x: auto
    'overflow-x:scroll',  // → overflow-x: scroll
    'overflow-y:auto',   // → overflow-y: auto
    'overflow-y:hidden', // → overflow-y: hidden
  ],
});
```

**Resolution rule:** Add `overflow`, `overflow-x`, `overflow-y` to `PROPERTY_MAP` with `valueType: 'raw'`. The raw resolver passes through the value as-is. The existing `overflow-hidden` keyword stays for backward compatibility.

### 3. Fraction/Percentage Dimensions

```ts
css({
  half: ['w:1/2'],       // → width: 50%
  third: ['w:1/3'],      // → width: 33.333333%
  twoThird: ['w:2/3'],   // → width: 66.666667%
  quarter: ['w:1/4'],    // → width: 25%
  threeQuarter: ['w:3/4'], // → width: 75%
  fifth: ['w:1/5'],      // → width: 20%
  sixth: ['w:1/6'],      // → width: 16.666667%
  fiveSixth: ['w:5/6'],  // → width: 83.333333%
  full: ['w:full'],      // → width: 100% (unchanged)
  oversize: ['w:3/2'],   // → width: 150% (allowed — valid CSS for overflow layouts)
});

// Works with h, min-w, max-w, min-h, max-h too
css({
  sidebar: ['min-w:1/4'], // → min-width: 25%
  main: ['max-w:3/4'],    // → max-width: 75%
});
```

**Resolution rule:** In `resolveSize()`, after checking spacing scale and `screen` keyword, detect `N/M` pattern via regex `/^(\d+)\/(\d+)$/`. Compute `(N/M * 100)` with 6 decimal places, append `%`. Reject only if `M === 0`. Fractions > 1 (e.g. `3/2` → `150%`) are allowed since `width: 150%` is valid CSS and has legitimate use cases (overflow containers, parallax elements).

### 4. Transform Keywords

```ts
css({
  hide: ['scale-0'],        // → transform: scale(0)
  smaller: ['scale-75'],    // → transform: scale(0.75)
  shrink: ['scale-90'],     // → transform: scale(0.9)
  subtle: ['scale-95'],     // → transform: scale(0.95)
  normal: ['scale-100'],    // → transform: scale(1)
  grow: ['scale-105'],      // → transform: scale(1.05)
  bigger: ['scale-110'],    // → transform: scale(1.1)
  large: ['scale-125'],     // → transform: scale(1.25)
  huge: ['scale-150'],      // → transform: scale(1.5)
});
```

**Resolution rule:** Add `scale-*` entries to `KEYWORD_MAP` as preset values. Each maps to `[{ property: 'transform', value: 'scale(N)' }]`. Initial set: 0, 75, 90, 95, 100, 105, 110, 125, 150. Translate and rotate utilities are deferred to a future issue — they have more complex axis/unit semantics.

## Manifesto Alignment

- **Principle 1 (If it builds, it works):** Token types in `utility-types.ts` will include the new patterns (`ColorToken` with opacity, `SizeProperty` with fractions, new `Keyword` entries, new `PropertyName` entries), so invalid tokens are caught at compile time. Both runtime and compiler resolvers updated in lockstep.
- **Principle 2 (One way to do things):** Each new token follows the existing `property:value` or keyword syntax — no new syntax forms.
- **Principle 3 (AI agents are first-class):** Tailwind-familiar patterns mean LLMs already know these shorthands. Less guessing, fewer errors.

## Non-Goals

- **Arbitrary CSS values** (`bg:[#ff0000]`, `w:[42px]`): Escape-hatch syntax is a separate design discussion.
- **Full transform composition** (`translate-x-2`, `rotate-45`, `-translate-y-1`): Complex axis/direction/unit semantics. Only `scale-*` keywords in this issue.
- **Responsive breakpoint prefixes** (`md:w:1/2`): Separate feature that requires parser changes.

## Scope Clarifications

- **Color opacity on shaded tokens** (`bg:primary.700/50`): In scope — naturally composes. The `/` suffix is parsed after the full color token (including `.shade`) is resolved.
- **Fractions > 1** (`w:3/2` → `150%`): In scope — valid CSS, matches Tailwind behavior.

## Unknowns

1. **`/` disambiguation** — The shorthand parser splits on `:`, so `/` stays in the value string. Color resolver sees `primary/50` and size resolver sees `1/2`. Since these have different `valueType` dispatch paths (`color` vs `size`), there's no ambiguity. **Resolved: no parser changes needed.**

2. **Color function for opacity** — The `@vertz/theme-shadcn` package stores color variables as full oklch values (e.g., `--color-primary: oklch(0.205 0 0)`), NOT decomposed HSL channels. The existing `bgOpacity()` helper in `packages/theme-shadcn/src/styles/_helpers.ts` already uses `color-mix(in oklch, ...)` for opacity. **Decision: use `color-mix(in oklch, var(--color-X) N%, transparent)` — this is the established pattern in the codebase and works with any color format (oklch, hsl, hex).**

## Type Flow Map

No generics involved. Changes span two layers:

### Runtime types (`packages/ui/src/css/utility-types.ts`)

The `UtilityClass` type is a computed union built from property groups. Required updates:

1. **`PropertyName` union** — add `'overflow' | 'overflow-x' | 'overflow-y'`
2. **`Keyword` union** — add `'scale-0' | 'scale-75' | 'scale-90' | ... | 'scale-150'`
3. **`RawProperty` group** — add `'overflow' | 'overflow-x' | 'overflow-y'` so `overflow-x:auto` passes type checking
4. **`ColorToken` type** — extend with opacity modifier: `` `${ColorNamespace}/${number}` | `${ColorNamespace}.${ColorShade}/${number}` ``
5. **Size value union** — extend with fraction pattern: `` `${number}/${number}` ``

These changes ensure the TypeScript compiler accepts the new tokens, upholding Principle 1.

### Compiler resolvers

Both `css-transformer.ts` and `extractor.ts` in `@vertz/ui-compiler` have duplicated resolution logic. Each phase must update these in parallel:

- **Overflow:** Adding to `PROPERTY_MAP` with `valueType: 'raw'` is sufficient — compiler's default case passes through raw values.
- **Scale keywords:** Adding to `KEYWORD_MAP` is sufficient — compiler's keyword branch handles them automatically.
- **Fractions:** `resolveValueInline()` / `resolveValue()` case `'size'` must add fraction detection.
- **Color opacity:** `resolveColorInline()` / `resolveColor()` must add `/N` suffix detection and `color-mix` wrapping.

## E2E Acceptance Test

```ts
import { resolveToken, TokenResolveError } from '../token-resolver';
import { parseShorthand } from '../shorthand-parser';

// Color opacity
const r1 = resolveToken(parseShorthand('bg:primary/50'));
expect(r1.declarations).toEqual([
  { property: 'background-color', value: 'color-mix(in oklch, var(--color-primary) 50%, transparent)' },
]);

// Overflow axis
const r2 = resolveToken(parseShorthand('overflow-y:auto'));
expect(r2.declarations).toEqual([{ property: 'overflow-y', value: 'auto' }]);

// Fraction
const r3 = resolveToken(parseShorthand('w:2/3'));
expect(r3.declarations).toEqual([{ property: 'width', value: '66.666667%' }]);

// Transform keyword
const r4 = resolveToken(parseShorthand('scale-110'));
expect(r4.declarations).toEqual([{ property: 'transform', value: 'scale(1.1)' }]);

// Pseudo + color opacity compose
const r5 = resolveToken(parseShorthand('hover:bg:primary/50'));
expect(r5.pseudo).toBe(':hover');
expect(r5.declarations).toEqual([
  { property: 'background-color', value: 'color-mix(in oklch, var(--color-primary) 50%, transparent)' },
]);

// Invalid tokens throw
expect(() => resolveToken(parseShorthand('bg:potato/50'))).toThrow(TokenResolveError);
expect(() => resolveToken(parseShorthand('w:0/0'))).toThrow(TokenResolveError);
expect(() => resolveToken(parseShorthand('bg:primary/200'))).toThrow(TokenResolveError);
```

## Implementation Plan

### Phase 1: Overflow Axis Variants

**Scope:** Simplest change — add 3 property entries to `PROPERTY_MAP`, update types.

**Changes:**
- `token-tables.ts`: Add `overflow`, `overflow-x`, `overflow-y` to `PropertyName` union and `PROPERTY_MAP` with `valueType: 'raw'`
- `utility-types.ts`: Add `'overflow' | 'overflow-x' | 'overflow-y'` to `RawProperty` group
- `token-resolver.test.ts`: Test all overflow variants
- `token-tables.test.ts`: Regression guard for new properties
- Compiler: No changes needed — `PROPERTY_MAP` additions with `'raw'` valueType are picked up automatically by the compiler's default pass-through branch.

**Acceptance criteria:**
```ts
describe('Given overflow axis variants in PROPERTY_MAP', () => {
  describe('When resolving overflow:auto', () => {
    it('Then returns overflow: auto', () => {});
  });
  describe('When resolving overflow-x:scroll', () => {
    it('Then returns overflow-x: scroll', () => {});
  });
  describe('When resolving overflow-y:hidden', () => {
    it('Then returns overflow-y: hidden', () => {});
  });
  describe('When resolving existing overflow-hidden keyword', () => {
    it('Then still works (no regression)', () => {});
  });
});
```

**Type-level tests (`.test-d.ts`):**
```ts
// Valid
const _overflow: UtilityClass = 'overflow-x:auto';
const _overflowY: UtilityClass = 'overflow-y:hidden';
```

### Phase 2: Transform Keywords

**Scope:** Add scale-* keyword entries to `KEYWORD_MAP`, update `Keyword` type.

**Changes:**
- `token-tables.ts`: Add `scale-0`, `scale-75`, `scale-90`, `scale-95`, `scale-100`, `scale-105`, `scale-110`, `scale-125`, `scale-150` to `Keyword` union and `KEYWORD_MAP`
- `token-resolver.test.ts`: Test all scale keywords
- `token-tables.test.ts`: Regression guard for new keywords
- Compiler: No changes needed — `KEYWORD_MAP` additions are picked up automatically by the compiler's keyword branch.

**Acceptance criteria:**
```ts
describe('Given scale-* transform keywords in KEYWORD_MAP', () => {
  describe('When resolving scale-0', () => {
    it('Then returns transform: scale(0)', () => {});
  });
  describe('When resolving scale-75', () => {
    it('Then returns transform: scale(0.75)', () => {});
  });
  describe('When resolving scale-90', () => {
    it('Then returns transform: scale(0.9)', () => {});
  });
  describe('When resolving scale-110', () => {
    it('Then returns transform: scale(1.1)', () => {});
  });
  describe('When resolving scale-150', () => {
    it('Then returns transform: scale(1.5)', () => {});
  });
  describe('When resolving hover:scale-110', () => {
    it('Then returns transform: scale(1.1) with :hover pseudo', () => {});
  });
});
```

**Type-level tests (`.test-d.ts`):**
```ts
// Valid
const _scale: UtilityClass = 'scale-110';
const _scaleHover: UtilityClass = 'hover:scale-110';
```

### Phase 3: Fraction/Percentage Dimensions

**Scope:** Add fraction detection to `resolveSize()` in runtime and compiler.

**Changes:**
- `token-resolver.ts`: In `resolveSize()`, add fraction pattern detection after spacing scale and `screen` checks
- `utility-types.ts`: Extend size value union with `` `${number}/${number}` ``
- `css-transformer.ts`: In `resolveValueInline()` case `'size'`, add matching fraction detection
- `extractor.ts`: In `resolveValue()` case `'size'`, add matching fraction detection
- `token-resolver.test.ts`: Test fraction values for w, h, min-w, max-w, plus error cases
- Error cases: `w:0/0` (division by zero), `w:abc/def` (non-numeric)

**Acceptance criteria:**
```ts
describe('Given fraction pattern in size value', () => {
  describe('When resolving w:1/2', () => {
    it('Then returns width: 50%', () => {});
  });
  describe('When resolving w:2/3', () => {
    it('Then returns width: 66.666667%', () => {});
  });
  describe('When resolving w:1/4', () => {
    it('Then returns width: 25%', () => {});
  });
  describe('When resolving w:3/2', () => {
    it('Then returns width: 150% (fractions > 1 allowed)', () => {});
  });
  describe('When resolving min-w:1/3', () => {
    it('Then returns min-width: 33.333333%', () => {});
  });
  describe('When resolving w:0/0', () => {
    it('Then throws TokenResolveError (division by zero)', () => {});
  });
});
```

**Type-level tests (`.test-d.ts`):**
```ts
// Valid
const _fraction: UtilityClass = 'w:1/2';
const _fractionH: UtilityClass = 'h:2/3';
```

### Phase 4: Color Opacity Modifier + Docs + Changeset

**Scope:** Most complex — modify `resolveColor()` to detect `/N` suffix and wrap in `color-mix()`. Also update docs and add changeset.

**Changes:**
- `token-resolver.ts`: In `resolveColor()`, detect `/N` suffix before other checks. Parse opacity, validate 0-100, resolve color token, wrap in `color-mix(in oklch, var(...) N%, transparent)`.
- `utility-types.ts`: Extend `ColorToken` with opacity pattern: `` `${ColorNamespace}/${number}` | `${ColorNamespace}.${ColorShade}/${number}` ``
- `css-transformer.ts`: In `resolveColorInline()`, add `/N` suffix detection and `color-mix` wrapping
- `extractor.ts`: In `resolveColor()`, add matching `/N` suffix detection and `color-mix` wrapping
- `token-resolver.test.ts`: Test opacity with plain tokens, dotted tokens, pseudo selectors, error cases
- `packages/docs/api-reference/ui/css.mdx`: Add sections for all four new token categories
- Changeset: `@vertz/ui` (patch), `@vertz/ui-compiler` (patch)

**Acceptance criteria:**
```ts
describe('Given color opacity modifier syntax', () => {
  describe('When resolving bg:primary/50', () => {
    it('Then returns color-mix(in oklch, var(--color-primary) 50%, transparent)', () => {});
  });
  describe('When resolving bg:primary.700/50', () => {
    it('Then returns color-mix(in oklch, var(--color-primary-700) 50%, transparent)', () => {});
  });
  describe('When resolving text:muted/90 (multi-mode)', () => {
    it('Then returns color: color-mix(in oklch, var(--color-muted) 90%, transparent)', () => {});
  });
  describe('When resolving border:ring/30 (multi-mode)', () => {
    it('Then returns border-color: color-mix(in oklch, var(--color-ring) 30%, transparent)', () => {});
  });
  describe('When resolving ring:primary.500/50 (multi-mode)', () => {
    it('Then returns outline-color: color-mix(in oklch, var(--color-primary-500) 50%, transparent)', () => {});
  });
  describe('When resolving bg:primary/0', () => {
    it('Then returns fully transparent', () => {});
  });
  describe('When resolving bg:primary/100', () => {
    it('Then returns fully opaque', () => {});
  });
  describe('When resolving bg:potato/50', () => {
    it('Then throws TokenResolveError (invalid namespace)', () => {});
  });
  describe('When resolving bg:primary/200', () => {
    it('Then throws TokenResolveError (out of range)', () => {});
  });
  describe('When resolving bg:primary/-10', () => {
    it('Then throws TokenResolveError (negative)', () => {});
  });
  describe('When resolving bg:primary/50.5', () => {
    it('Then throws TokenResolveError (non-integer)', () => {});
  });
  describe('When resolving bg:primary/abc', () => {
    it('Then throws TokenResolveError (non-numeric)', () => {});
  });
  describe('When resolving hover:bg:primary/50', () => {
    it('Then returns correct value with :hover pseudo', () => {});
  });
});
```

**Type-level tests (`.test-d.ts`):**
```ts
// Valid
const _opacity: UtilityClass = 'bg:primary/50';
const _opacityShade: UtilityClass = 'bg:primary.700/50';
const _opacityText: UtilityClass = 'text:muted/90';
```
