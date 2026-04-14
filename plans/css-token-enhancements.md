# CSS Token Enhancements: Utility Tokens & Raw Palettes

**Issues:** [#2642](https://github.com/vertz-dev/vertz/issues/2642), [#2641](https://github.com/vertz-dev/vertz/issues/2641)
**Status:** Draft
**Packages:** `@vertz/ui`, `native/vertz-compiler-core`

---

## Problem

Two gaps in the CSS token system force developers to fall back to inline `style` attributes:

1. **Missing utility tokens** (#2642) — `font:mono`, `whitespace:pre`, `text-overflow:ellipsis`, `overflow-wrap:break-word`, and a `truncate` keyword are common CSS properties that have no token shorthand.
2. **Raw Tailwind palette colors** (#2641) — All 22 Tailwind color palettes ship in `@vertz/ui/css/palettes`, but `css()` rejects raw palette names like `bg:green.100` because they're not in `COLOR_NAMESPACES`.

Both issues affect developer ergonomics. Issue #2642 forces inline styles for basic text utilities. Issue #2641 blocks rapid prototyping with familiar Tailwind colors.

---

## API Surface

### 1. Utility Tokens (#2642)

#### `font:mono`, `font:sans`, `font:serif` — Font family

```ts
css({
  code: ['font:mono'],
  // → font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace

  body: ['font:sans'],
  // → font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"

  prose: ['font:serif'],
  // → font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif
});
```

`font` is already a multi-mode property (weight vs. size). We add `mono`, `sans`, and `serif` as a third mode that resolves to `font-family`. Font stacks match Tailwind v4.

**Resolution order for `font:value`:** (1) font-family keywords (`mono`, `sans`, `serif`), (2) font-weight scale, (3) font-size scale. Family is checked first to prevent any future collisions with weight/size names.

#### `whitespace` property shorthand

```ts
css({
  pre: ['whitespace:pre'],           // → white-space: pre
  wrap: ['whitespace:pre-wrap'],     // → white-space: pre-wrap
  preL: ['whitespace:pre-line'],     // → white-space: pre-line
  norm: ['whitespace:normal'],       // → white-space: normal
});
```

New property shorthand `whitespace` → `white-space`, with value type `raw` (passthrough).

#### `text-overflow` property shorthand

```ts
css({
  clip: ['text-overflow:ellipsis'],  // → text-overflow: ellipsis
  clip2: ['text-overflow:clip'],     // → text-overflow: clip
});
```

New property shorthand `text-overflow` → `text-overflow`, value type `raw`.

#### `overflow-wrap` property shorthand

```ts
css({
  wrap: ['overflow-wrap:break-word'],    // → overflow-wrap: break-word
  wrap2: ['overflow-wrap:anywhere'],     // → overflow-wrap: anywhere
  wrap3: ['overflow-wrap:normal'],       // → overflow-wrap: normal
});
```

New property shorthand `overflow-wrap` → `overflow-wrap`, value type `raw`.

#### `truncate` keyword

```ts
css({
  title: ['truncate'],
  // → overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
});
```

Multi-declaration keyword, matching Tailwind's `truncate` utility.

#### `whitespace-pre` and `whitespace-pre-wrap` keywords

```ts
css({
  code: ['whitespace-pre'],         // → white-space: pre
  wrap: ['whitespace-pre-wrap'],    // → white-space: pre-wrap
});
```

Additional keyword aliases for the most common whitespace values, matching the existing `whitespace-nowrap` pattern. The overlap with `whitespace:pre` and `whitespace:pre-wrap` property shorthands is intentional — keywords are terser for the most common cases, while the property form covers all values (including `pre-line`, `normal`).

### 2. Raw Tailwind Palette Colors (#2641)

```ts
css({
  box: ['bg:green.100', 'text:red.700', 'border:blue.300'],
  // → background-color: oklch(0.962 0.044 156.743)
  // → color: oklch(0.505 0.213 27.518)
  // → border-color: oklch(0.809 0.105 251.813)
});
```

Raw palette colors resolve directly to their oklch values from the palette table. They do **not** go through CSS custom properties — this is intentional:

- **No runtime overhead** — no extra CSS vars injected
- **Works without theme config** — palette colors are deterministic values
- **Opacity modifiers work** — `bg:green.100/50` → `color-mix(in oklch, oklch(...) 50%, transparent)`

All 22 Tailwind v4 palettes are supported: slate, zinc, neutral, stone, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose. (21 resolve to raw oklch; `gray` is a special case — see below.)

Shades: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950.

#### `gray` namespace precedence

`gray` already exists in `COLOR_NAMESPACES` as a semantic color token. Semantic namespaces take precedence — `bg:gray.500` resolves to `var(--color-gray-500)` (CSS custom property), **not** the raw oklch palette value. This is correct behavior: semantic tokens are theme-aware and should not be shadowed by raw palette lookups. The remaining 21 palette names are not in `COLOR_NAMESPACES` and resolve to direct oklch values. Developers who want raw Tailwind gray can use one of the neutral palette names (`slate`, `zinc`, `neutral`, `stone`) which are visually similar.

```ts
// Invalid shade → TokenResolveError
css({ x: ['bg:green.42'] });
// → Error: Unknown palette shade '42' for 'green'. Use: 50, 100, 200, ..., 950

// Invalid palette name → still errors
css({ x: ['bg:chartreuse.100'] });
// → Error: Unknown color token 'chartreuse.100'...
```

---

## Manifesto Alignment

### "One Way to Do Things"
- Utility tokens remove the need for inline `style` fallbacks. `font:mono` instead of `style={{ fontFamily: '...' }}`.
- Raw palette colors use the same `namespace.shade` syntax as semantic colors. No new syntax to learn.

### "Type Safety Wins"
- All new tokens are typed — `PropertyName`, `Keyword`, and `ColorNamespace` union types are updated so the compiler rejects typos.
- Invalid palette shades produce clear error messages at compile time.

### "Production-Ready by Default"
- These are standard CSS patterns every app needs. Shipping them out of the box reduces friction.

### Tradeoffs
- Raw palettes resolve to direct oklch values rather than CSS custom properties. This means they can't be themed/overridden at runtime, but that's the expected behavior — semantic tokens (`primary`, `danger`) remain the recommended approach for design-system consistency. Raw palettes are for quick prototyping and one-off colors.

### Rejected Alternatives
- **CSS variable approach for palettes**: Injecting 242 CSS variables (22 palettes × 11 shades) into every app is wasteful. Most apps only use 2-3 palettes. Direct oklch resolution avoids this overhead.
- **`font-family` as separate property**: A new `font-family:mono` shorthand would work but is verbose. The `font:mono` multi-mode extension is more ergonomic and matches how `font:bold` and `font:lg` already work.

---

## Non-Goals

- **Adding ALL Tailwind utilities** — we only add the specific utilities identified in #2642. This is not a Tailwind compatibility layer.
- **Dark-mode palette variants** — raw palette colors are constant values, not contextual. Use semantic tokens for dark-mode switching.
- **Custom palette registration** — users can't add new palette names to the token system. Use `globalCss()` or CSS custom properties for custom colors.
- **Palette CSS custom properties** — we deliberately resolve to direct values, not `var(--color-green-100)`.
- **Fixing pre-existing TS/Rust sync gaps** — the Rust `property_map()` is already missing some entries that exist in TS (`top`, `right`, `bottom`, `left`, `object`, `aspect`) and `ring`/`list` multi-mode. File a separate issue; this PR only adds new tokens to both.

---

## Unknowns

None identified. Both changes are additive extensions to well-understood systems (token tables, keyword map, color resolver). The palette data already exists in the codebase.

---

## Type Flow Map

### Utility Tokens

```
PropertyName type (token-tables.ts)
  → adds 'whitespace' | 'text-overflow' | 'overflow-wrap'
  → PROPERTY_MAP runtime constant (token-tables.ts) 
  → resolveToken() (token-resolver.ts) routes to resolveValue() with valueType 'raw'
  → property_map() (css_token_tables.rs) — Rust compiler resolution

Keyword type (token-tables.ts)
  → adds 'truncate' | 'whitespace-pre' | 'whitespace-pre-wrap'
  → KEYWORD_MAP runtime constant (token-tables.ts)
  → resolveToken() keyword branch (token-resolver.ts)
  → keyword_map() (css_token_tables.rs) — Rust compiler resolution

font:mono in resolveFont() (token-resolver.ts)
  → FONT_FAMILY_SCALE lookup before weight/size
  → resolve_multi_mode("font", "mono") (css_token_tables.rs) — Rust compiler
```

### Raw Palette Colors

```
resolveColorToken() (token-resolver.ts)
  → dotted notation: extract namespace + shade
  → check COLOR_NAMESPACES first (semantic) → if match: var(--color-{ns}-{shade})
  → check RAW_PALETTE_NAMES (new) → if match: lookup shade in palette data
    → valid shade (50-950): return oklch string
    → invalid shade: throw "Unknown palette shade '42' for 'green'. Use: 50, 100, ..."
  → neither: throw generic "Unknown color token" error

resolve_color_token() (css_token_tables.rs)
  → same precedence: is_color_namespace() first, then is_raw_palette()
  → Rust palette lookup uses two-level match for efficiency:
    fn resolve_palette_shade(palette: &str, shade: &str) -> Option<&'static str> {
      let shades = palette_shades(palette)?;  // 22-arm match → &[&str; 11]
      shade_index(shade).map(|i| shades[i])   // 11-arm match → index
    }
  → 22 + 11 = 33 match arms total (not 242 flat arms)
```

No dead generics — all paths are concrete string unions and runtime maps.

---

## E2E Acceptance Test

```ts
import { describe, expect, it } from '@vertz/test';
import { resolveToken, TokenResolveError } from '@vertz/ui/internals';

describe('Feature: CSS utility token enhancements', () => {
  describe('Given font:mono shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces font-family with monospace stack', () => {
        const result = resolveToken({ property: 'font', value: 'mono', pseudo: null });
        expect(result.declarations).toEqual([{
          property: 'font-family',
          value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }]);
      });
    });
  });

  describe('Given font:sans shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces font-family with sans-serif stack', () => {
        const result = resolveToken({ property: 'font', value: 'sans', pseudo: null });
        expect(result.declarations[0].property).toBe('font-family');
        expect(result.declarations[0].value).toContain('ui-sans-serif');
      });
    });
  });

  describe('Given font:serif shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces font-family with serif stack', () => {
        const result = resolveToken({ property: 'font', value: 'serif', pseudo: null });
        expect(result.declarations[0].property).toBe('font-family');
        expect(result.declarations[0].value).toContain('ui-serif');
      });
    });
  });

  describe('Given whitespace:pre shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces white-space: pre', () => {
        const result = resolveToken({ property: 'whitespace', value: 'pre', pseudo: null });
        expect(result.declarations).toEqual([{ property: 'white-space', value: 'pre' }]);
      });
    });
  });

  describe('Given text-overflow:ellipsis shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces text-overflow: ellipsis', () => {
        const result = resolveToken({ property: 'text-overflow', value: 'ellipsis', pseudo: null });
        expect(result.declarations).toEqual([{ property: 'text-overflow', value: 'ellipsis' }]);
      });
    });
  });

  describe('Given overflow-wrap:break-word shorthand', () => {
    describe('When resolving the token', () => {
      it('Then produces overflow-wrap: break-word', () => {
        const result = resolveToken({ property: 'overflow-wrap', value: 'break-word', pseudo: null });
        expect(result.declarations).toEqual([{ property: 'overflow-wrap', value: 'break-word' }]);
      });
    });
  });

  describe('Given truncate keyword', () => {
    describe('When resolving the token', () => {
      it('Then produces overflow + whitespace + text-overflow declarations', () => {
        const result = resolveToken({ property: 'truncate', value: null, pseudo: null });
        expect(result.declarations).toEqual([
          { property: 'overflow', value: 'hidden' },
          { property: 'white-space', value: 'nowrap' },
          { property: 'text-overflow', value: 'ellipsis' },
        ]);
      });
    });
  });

  describe('Given bg:green.100 raw palette color', () => {
    describe('When resolving the token', () => {
      it('Then produces background-color with direct oklch value', () => {
        const result = resolveToken({ property: 'bg', value: 'green.100', pseudo: null });
        expect(result.declarations[0].property).toBe('background-color');
        expect(result.declarations[0].value).toMatch(/^oklch\(/);
      });
    });
  });

  describe('Given bg:green.100/50 with opacity modifier', () => {
    describe('When resolving the token', () => {
      it('Then produces color-mix with oklch value', () => {
        const result = resolveToken({ property: 'bg', value: 'green.100/50', pseudo: null });
        expect(result.declarations[0].value).toMatch(/^color-mix\(in oklch,/);
        expect(result.declarations[0].value).toContain('50%');
      });
    });
  });

  describe('Given bg:gray.500 semantic namespace precedence', () => {
    describe('When resolving the token', () => {
      it('Then resolves to CSS var (semantic), not raw oklch', () => {
        const result = resolveToken({ property: 'bg', value: 'gray.500', pseudo: null });
        expect(result.declarations[0].value).toBe('var(--color-gray-500)');
      });
    });
  });

  describe('Given bg:green.42 invalid shade', () => {
    describe('When resolving the token', () => {
      it('Then throws TokenResolveError', () => {
        expect(() => resolveToken({ property: 'bg', value: 'green.42', pseudo: null }))
          .toThrow(TokenResolveError);
      });
    });
  });

  // @ts-expect-error — 'chartreuse' is not a valid palette name
  describe('Given bg:chartreuse.100 unknown palette', () => {
    describe('When resolving the token', () => {
      it('Then throws TokenResolveError', () => {
        expect(() => resolveToken({ property: 'bg', value: 'chartreuse.100', pseudo: null }))
          .toThrow(TokenResolveError);
      });
    });
  });
});
```
