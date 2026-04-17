# Drop Classname Utilities

> Remove the tailwind-ish token-string vocabulary (`'p:4'`, `'bg:background'`, `'rounded:lg'`, `'hover:bg:primary.700'`) from `css()` / `variants()` and keep a thin scoped-styles API that takes plain CSS-property objects (camelCase). Developers reference theme tokens through CSS custom properties (`var(--color-primary-500)`) or the optional typed `token.*` helper. No custom vocabulary, no shorthand parser, no runtime/compiler token resolver.

## Problem

Today `css()` and `variants()` accept arrays of shorthand token strings:

```ts
const styles = css({
  panel: ['p:4', 'bg:background', 'rounded:lg'],
});
```

This vocabulary is a parallel dialect of CSS with three concrete costs:

1. **Framework coverage burden.** `packages/ui/src/css/token-tables.ts` (~750 lines) is the single source of truth for every spacing key, color namespace, radius scale, font scale, alignment keyword, pseudo prefix, and property shorthand. Every new CSS property developers want to use in the shorthand is a new `PropertyName` arm, a new `valueType`, a new branch in `token-resolver.ts`, and a new arm of the `UtilityClass` template-literal union from `plans/type-safe-css-utilities.md` (#1455). Missing entries fail silently ("raw" valueType) or loudly depending on the path. We've been paying this tax for two years.
2. **Ambiguity by design.** `'text:foreground'` sets `color`; `'text:sm'` sets `font-size`; `'text:center'` sets `text-align`. The resolver is multi-mode per property shorthand. Humans and LLMs both have to keep a mental table of which mode applies to which value.
3. **LLMs don't know our vocabulary.** LLMs have seen millions of CSS declarations and thousands of tailwind programs. They have seen very little Vertz. The most common failure mode is spelling: LLMs produce `'bg-background'` (tailwind), `'padding:4'` (long form), `'text-foreground'` (tailwind), `'p:16'` (raw pixels), etc. The compiler's diagnostics catch some but not all (the "raw" value escape hatch lets many through). Each miss is an agent re-prompt.

Meanwhile, we already shipped camelCase CSS-property objects for the inline `style` prop (`plans/style-object-support.md`, `plans/camelcase-style-migration.md`). That shape is unambiguous, universally known by LLMs, and type-checked from `lib.dom.d.ts`. The scoped-styles API should use the same shape. The existing `css({ panel: [{ '&:hover': ['bg:primary', { 'background-color': 'oklch(...)' }] }] })` "escape hatch" already accepts plain CSS declaration maps inside nested selectors — we've been carrying two input shapes. This PR collapses them to one.

### Explicit supersession of `type-safe-css-utilities.md` (#1455)

This PR supersedes #1455. The `UtilityClass` template-literal union work was a real DX win in its own frame, but it narrowed the wrong vocabulary. The tradeoff ranking has changed: LLM-first (Principle 3) plus single-style-vocabulary (Principle 2) outweigh compile-time validation of a custom dialect. We keep `CamelCSSDeclarations` (property-name validation from `lib.dom.d.ts`) and drop the custom token union. The changeset for this PR explicitly credits #1455 and explains why we're retracting it.

## API Surface

### `css()` — one CSS-declarations object per block

```ts
import { css } from '@vertz/ui';

const styles = css({
  panel: {
    backgroundColor: 'var(--color-background)',
    padding: 24,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-foreground)',
  },
});

styles.panel; // => string (generated class name)
styles.title; // => string
styles.css;   // => compiled CSS text (non-enumerable)
```

- **Keys are camelCase** CSS property names (matches inline `style` prop and `CamelCSSDeclarations`).
- **Values are `string | number`**. Numeric values follow the auto-px rules documented in `plans/style-object-support.md`: dimensional properties get `px`, unitless properties (`opacity`, `lineHeight`, `zIndex`, `fontWeight`, etc.) do not, zero is always `0`, CSS custom property keys (`--*`) pass numeric values through as-is.

### Nested selectors

Selector keys must start with `&` (nested pseudo/attribute) or `@` (at-rule). Anything else is a CSS property name.

```ts
const button = css({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    backgroundColor: 'var(--color-primary-600)',
    color: 'white',
    padding: '8px 16px',
    borderRadius: 6,

    '&:hover': {
      backgroundColor: 'var(--color-primary-700)',
    },
    '&:focus-visible': {
      outline: '2px solid var(--color-ring)',
    },
    '&[data-state="open"]': {
      backgroundColor: 'var(--color-primary-800)',
    },
    '& > svg': {
      marginInlineEnd: 8,
    },
    '@media (min-width: 768px)': {
      padding: '12px 20px',
    },
  },
});
```

Rule: if a key starts with `&` or `@`, it's a selector and its value is a `StyleBlock` (recursive). Otherwise, it's a CSS property name (validated against `CamelCSSDeclarations`). Any other shape (e.g. bare `'hover'`, `':root'`) is a type error.

### `variants()` — same object shape

```ts
import { variants } from '@vertz/ui';

const button = variants({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    fontWeight: 500,
  },
  variants: {
    intent: {
      primary: {
        backgroundColor: 'var(--color-primary-600)',
        color: 'white',
        '&:hover': { backgroundColor: 'var(--color-primary-700)' },
      },
      danger: { backgroundColor: 'var(--color-danger-500)', color: 'white' },
      ghost: { backgroundColor: 'transparent', color: 'var(--color-foreground)' },
    },
    size: {
      sm: { fontSize: 12, paddingInline: 12, height: 32 },
      md: { fontSize: 14, paddingInline: 16, height: 40 },
      lg: { fontSize: 16, paddingInline: 20, height: 48 },
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
  compoundVariants: [
    { intent: 'primary', size: 'sm', styles: { paddingInline: 8 } },
  ],
});

const cls = button({ intent: 'ghost', size: 'lg' });
```

`styles` in `base`, each variant option, and `compoundVariants[i].styles` is a single `StyleBlock`. (Array form is dropped; compound variants never relied on it in practice — grepped zero first-party call sites.)

### Theme tokens — raw `var(...)` *or* typed `token.*`

`compileTheme()` emits these CSS variable namespaces today (unchanged by this PR):

- `--color-<name>-<shade>` (e.g. `--color-primary-500`), `--color-<name>` (single-value tokens like `--color-background`)
- `--spacing-<name>` (e.g. `--spacing-4`)
- `--font-<name>` (e.g. `--font-sans`)
- Plus `--radius` as a base value; the scale (`xs`…`3xl`) is `calc(var(--radius) * k)` (see `packages/ui/src/css/token-tables.ts` — `RADIUS_SCALE`). Since `RADIUS_SCALE` is *calc expressions over a single `--radius`*, there is no `--radius-md` variable; you compose from `--radius` or hard-code.

Two ways to reference them:

**Raw strings** — always works, zero indirection:

```ts
const card = css({
  root: {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    padding: 'var(--spacing-4)',
  },
});
```

**Typed `token.*` helper** — autocomplete + typo rejection:

```ts
import { css, token } from '@vertz/ui';

const card = css({
  root: {
    backgroundColor: token.color.background,              // → 'var(--color-background)'
    color: token.color.foreground,                        // → 'var(--color-foreground)'
    padding: token.spacing[4],                            // → 'var(--spacing-4)'
    borderColor: token.color.primary[500],                // → 'var(--color-primary-500)'
  },
});
```

`token` is a `Proxy` that produces `var(--<ns>-<k>)` strings lazily. Every access is a plain string after the first dot path; it's interchangeable with raw `var(...)`.

#### `token.*` typing — concrete plan

Vanilla (no theme augmentation):

```ts
// packages/ui/src/css/token.ts
export interface VertzThemeTokens {
  color: Record<string, string | Record<string | number, string>>;
  spacing: Record<string | number, string>;
  font: Record<string, string>;
  // ... other namespaces seeded with string-indexed signatures
}

export const token: VertzThemeTokens;
```

Project augmentation (opt-in, same pattern as our router typed paths):

```ts
// app/theme.ts (user code)
import type {} from '@vertz/ui';
import { appTheme } from './styles/theme';

declare module '@vertz/ui' {
  interface VertzThemeTokens {
    color: typeof appTheme.colors;
    spacing: typeof appTheme.spacing;
    font: typeof appTheme.fonts;
  }
}
```

After augmentation, `token.color.nonexistent` is a type error, `token.spacing[4]` returns `string` (with literal narrowing if the theme defines it that way). Without augmentation, every dot path types as `string` and nothing is a type error (graceful fallback).

**Numeric key support.** Accessing `token.spacing[4]` vs `token.spacing['4']` must both work. Typed as `Record<string | number, string>`, TS normalizes both to the string key.

**Fallback behavior.** `token.color.nonexistent` — even when typed — produces a plain `var(--color-nonexistent)` string at runtime. There is no dev-time throw, no warn. Rationale: the alternative (schema-aware proxy) would require shipping the compiled theme at runtime. We lean on static types instead.

**Bundle cost.** `token.ts` is ~30 lines, one `Proxy` with `get` trap. Estimated gzipped: <200 bytes.

### Dynamic styles at runtime

For values computed at runtime, use the inline `style` prop (shipped in `style-object-support.md`):

```tsx
<div style={{ padding: token.spacing[scaleIndex] }} />
<div style={{ padding: `var(--spacing-${scaleIndex})` }} />
<div style={{ width: isOpen ? 320 : 0 }} />
```

`css()` is strictly for styles known at definition time; the compiler extracts them to static CSS. Runtime-computed styles belong on the element. **This deletes one use case from `s()`** (dynamic token-string composition), but the replacement is a direct `style={{ ... }}` object — one fewer API, same expressiveness.

### Removed exports

The following are deleted from the public API:

- `s()` — inline style helper built on the token parser. Replacement: `style={{ ... }}` (shipped).
- `UtilityClass`, `StyleEntry`, `StyleValue` types — no longer meaningful.
- `parseShorthand`, `resolveToken`, `isKnownProperty`, `isValidColorToken`, `ShorthandParseError`, `TokenResolveError`, `InlineStyleError` — deleted from `@vertz/ui/internals`. Audit in Phase 5 confirms no external consumers (`@vertz/theme-shadcn`, `@vertz/ui-primitives`, `@vertz/ui-auth`, `@vertz/landing` all cleaned first).

### No deprecation shim

Token-string arrays are rejected at compile time once Phase 5 lands:

```ts
css({
  // @ts-expect-error — arrays of shorthand strings removed
  panel: ['p:4', 'bg:background'],
});
```

Pre-v1, per `.claude/rules/policies.md` — no backward-compat shim, no migration aliases.

## Manifesto Alignment

### Principle 3: AI agents are first-class users

Primary motivation. A `CamelCSSDeclarations`-typed object is the shape LLMs emit by default from React/emotion/stitches training data. Removing the Vertz-specific dialect eliminates the single largest class of LLM-generated styling errors.

### Principle 1: If it builds, it works

`CamelCSSDeclarations` is derived from `lib.dom.d.ts`. Typos on property names fail typecheck without us hand-maintaining `token-tables.ts`. Selector keys are typed via template-literal unions (`` `&${string}` | `@${string}` ``); non-selector keys fall into the property validator. `token.*` typing is graceful: with theme augmentation, typos fail typecheck; without, it silently produces `var(...)` strings — never crashes.

### Principle 2: One way to do things

Today scoped-styles accepts **two** input shapes (token-string arrays AND CSSDeclarations objects inside nested selectors). Inline styles accept only the object form. This PR collapses scoped-styles to a single shape and unifies it with inline styles. One style vocabulary across the framework.

### Principle 4: No magic

No shorthand parser. No token resolver. No multi-mode properties. CSS-in-JS the way every CSS-in-JS library does it.

### Tradeoffs accepted

- **Verbosity.** `{ padding: 16 }` vs `'p:4'`. Compensated by `token.spacing[4]` for tokenized spacing.
- **Pseudo-state nesting cost.** `'hover:bg:primary.700'` (one line, short) → `'&:hover': { backgroundColor: token.color.primary[700] }` (three lines, two braces). This is the biggest ergonomic regression. The doc does not pretend it's a wash — it's a real tax on human typing. Kept because: (a) LLMs get it right every time, (b) it composes naturally with multiple properties per pseudo-state, (c) it's what every CSS-in-JS library does, so no novelty cost.
- **No compile-time validation of theme-value strings.** `backgroundColor: 'var(--color-nonsense)'` is not caught. `token.color.nonsense` is caught only after augmentation. Accepted: raw strings stay raw (per Principle 4).
- **Duplicate auto-px table.** The runtime `styleObjectToString()` and the Rust native extractor must ship identical unitless-property lists. Addressed in Implementation Plan under "single source of truth."
- **Mechanical diff is large.** ~100-200 call sites in `packages/`, ~555 token instances in test files. Addressed in Phase 4 via a one-shot `sed`/AST script + manual review, not hand-rewriting.

### What was rejected

- **Keep token strings, just narrow the type union harder.** That's #1455. Doesn't fix the LLM problem — the vocabulary is still non-standard, and the template-literal union has known `tsc` perf pressure.
- **Ship a typed helper like `t.p(4)` / `t.bg('primary')`.** Different spelling, same vocabulary problem.
- **Auto-import spacing tokens as aliases.** `padding: space[4]` would require compiler rewriting and hides the `var(...)` reference. `token.*` does the same without magic.
- **Keep `s()` as-is.** `s()` is token-parser-based; deleting the parser deletes `s()`. Replacement is the shipped inline `style` object.
- **Gradual coexistence long-term.** Phase 1 has both shapes transiently (single dev-cycle during migration). Permanent coexistence was rejected: it perpetuates the vocabulary problem and forces us to keep the token-tables module alive.

## Non-Goals

- **Typing CSS *values*** (e.g., `color: 'ref'` typo not caught). Matches React/emotion/stitches. `csstype` dep is rejected elsewhere.
- **Theme-aware value validation** (`color: 'var(--color-nonexistent)'` not caught unless dev uses `token.*`).
- **Tailwind compatibility layer.** No `tw\`p-4\`` adapter.
- **Auto-generated `theme.d.ts` at build time.** Declaration-merging augmentation is in scope; codegen is a later optimization.
- **Changing how `compileTheme()` emits CSS variables.** Same variable names, same structure.
- **Tree-shaking unused theme tokens.** Orthogonal (`plans/1912-css-tree-shaking.md`).
- **Ensuring visual pixel-parity during migration.** Migration targets semantic parity; minor differences from resolving `1.5rem` → `24px` (literal) are acceptable.
- **Fixing the inconsistency where `SPACING_SCALE` resolves to literal `rem` values instead of `var(--spacing-*)`.** That bug pre-dates this PR. Post-migration we recommend theme-defined `var(--spacing-*)` as the canonical path; fixing at source is a follow-up.

## Unknowns

**1. TypeScript inference cost of recursive `StyleBlock`.** Self-referential types can explode check time. Benchmark in Phase 1 on `packages/landing` (~100 call sites) and `packages/theme-shadcn` (deep variants). Budget: < 15% regression on monorepo `vtz run typecheck`. Mitigation: cap recursion at 4 levels with a terminal `Record<string, unknown>`. No other open unknowns.

## POC Results

No standalone POC. Two pieces of existing art establish feasibility:

1. **Inline `style` object support** (shipped, `plans/style-object-support.md`). Provides the camelCase-to-kebab + auto-px + unitless-property + custom-property-passthrough pipeline. We lift `styleObjectToString()` and `UNITLESS_PROPERTIES` into the scoped-styles extractor. Rust native extractor ports the same table.
2. **Existing object-form escape hatch in `css()`.** `css({ panel: [{ '&:hover': [{ 'background-color': 'red' }] }] })` already compiles object-form nested selectors — both TS runtime (`packages/ui/src/css/class-generator.ts`) and Rust native extractor (`native/vertz-compiler-core/src/css_transform.rs`) handle it. We change the top-level to object form; the recursion reuses the same code paths.

## Type Flow Map

```
lib.dom.d.ts (CSSStyleDeclaration)
  ↓
CamelCSSPropertyName = KebabToCamel<CSSPropertyName>       [existing, css-properties.ts:357]
  ↓
CamelCSSDeclarations                                        [existing, css-properties.ts:366]
  = { [K in CamelCSSPropertyName | `-${string}` | `Webkit${string}` | `Moz${string}` | `Ms${string}`]?: string | number }
  ↓  (value widened to `string | number` for auto-px; new type in style-block.ts)
StyleBlock
  = CSSDeclarations & { [K in `&${string}` | `@${string}`]?: StyleBlock }
  ↓
CSSInput = Record<string, StyleBlock>
  ↓
css<T extends CSSInput>(input: T): CSSOutput<T>
  ↓
CSSOutput<T> = { readonly [K in keyof T & string]: string } & { readonly css: string }
  ↓ consumed by user code (styles.panel, styles.title, etc.)

variants<V extends VariantDefinitions>(config): VariantFunction<V>
  ↓
VariantDefinitions = Record<string, Record<string, StyleBlock>>
  ↓
VariantProps<V> = { [K in keyof V]?: keyof V[K] }
  ↓
VariantFunction<V> = (props?: VariantProps<V>) => string

token: VertzThemeTokens                                     [new, token.ts]
  ↓ (declaration-merging point)
`declare module '@vertz/ui' { interface VertzThemeTokens { … } }`
  ↓ consumed by user code (token.color.primary[500])
```

Generic count: **two** (`T` in `css`, `V` in `variants`). Both reach consumer surfaces (typed block-name access, typed variant-prop rejection). No dead generics.

**Type-flow verification**: Template-literal index signatures (`` `&${string}` ``) compose with `CamelCSSDeclarations` via intersection because their key spaces are disjoint — no CSS property begins with `&` or `@`. Existing prior art: `CamelCSSDeclarations` already intersects `CamelCSSPropertyName` with `` `-${string}` `` and `` `Webkit${string}` `` template-literal keys. Phase 1 ships a `.test-d.ts` proving both positive (valid selectors accepted) and negative (`'hover'` without `&` rejected) cases before implementation proceeds.

## E2E Acceptance Test

Runtime behaviour (`.test.ts`):

```ts
import { css, variants, token } from '@vertz/ui';
import { describe, it, expect } from 'vitest';

describe('Feature: Object-form css() replaces token-string utilities', () => {
  describe('Given a css() call with a plain CSS-declarations object', () => {
    it('Then returns typed block-name → class-name record', () => {
      const styles = css({
        panel: { backgroundColor: 'var(--color-background)', padding: 24, borderRadius: 8 },
      });
      expect(typeof styles.panel).toBe('string');
      expect(styles.css).toContain('background-color: var(--color-background)');
      expect(styles.css).toContain('padding: 24px');
      expect(styles.css).toContain('border-radius: 8px');
    });
  });

  describe('Given nested & and @media selectors', () => {
    it('Then emits nested rules with the block class as the parent', () => {
      const styles = css({
        button: {
          color: 'white',
          '&:hover': { color: 'var(--color-primary-100)' },
          '@media (min-width: 768px)': { padding: 16 },
        },
      });
      expect(styles.css).toMatch(/\.[\w-]+:hover\s*\{\s*color:\s*var\(--color-primary-100\)/);
      expect(styles.css).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.[\w-]+\s*\{\s*padding:\s*16px/);
    });
  });

  describe('Given numeric values', () => {
    it('Then auto-px matches inline-style rules (single source of truth)', () => {
      const styles = css({
        x: { padding: 16, opacity: 0.5, zIndex: 10, margin: 0, lineHeight: 1.4 },
      });
      expect(styles.css).toContain('padding: 16px');
      expect(styles.css).toContain('opacity: 0.5');
      expect(styles.css).toContain('z-index: 10');
      expect(styles.css).toContain('margin: 0');
      expect(styles.css).not.toContain('margin: 0px');
      expect(styles.css).toContain('line-height: 1.4');
    });
  });

  describe('Given hash-stable class names', () => {
    it('Then property reordering does not change the class name', () => {
      const a = css({ x: { padding: 16, color: 'red' } });
      const b = css({ x: { color: 'red', padding: 16 } });
      expect(a.x).toBe(b.x);
    });
  });

  describe('Given a variants() call with compound variants', () => {
    it('Then returns a function yielding correct class list', () => {
      const button = variants({
        base: { display: 'inline-flex' },
        variants: {
          intent: {
            primary: { backgroundColor: 'var(--color-primary-600)' },
            ghost: { backgroundColor: 'transparent' },
          },
          size: { sm: { paddingInline: 12 }, md: { paddingInline: 16 } },
        },
        defaultVariants: { intent: 'primary', size: 'md' },
        compoundVariants: [{ intent: 'primary', size: 'sm', styles: { paddingInline: 8 } }],
      });
      expect(typeof button({ intent: 'ghost', size: 'sm' })).toBe('string');
      expect(button.css).toContain('background-color: transparent');
    });
  });

  describe('Given the token helper', () => {
    it('Then every dot path returns a plain var(...) string', () => {
      expect(token.color.background).toBe('var(--color-background)');
      expect(token.spacing[4]).toBe('var(--spacing-4)');
      expect(token.color.primary[500]).toBe('var(--color-primary-500)');
    });

    it('Then missing theme keys still return var(...) (no throw)', () => {
      expect(token.color.definitelyNotReal).toBe('var(--color-definitelyNotReal)');
    });
  });
});
```

Type-level behaviour (`.test-d.ts`):

```ts
import { expectTypeOf } from 'expect-type';
import { css, variants, token } from '@vertz/ui';

// ✅ Valid
css({ a: { backgroundColor: 'red', padding: 16 } });
css({ a: { opacity: 0.5, color: 'red' } });
css({ a: { color: 'red', '&:hover': { color: 'blue' } } });
css({ a: { '--my-var': 'red', color: 'var(--my-var)' } });

// ❌ Token strings no longer accepted
css({
  // @ts-expect-error — arrays of shorthand strings removed
  a: ['p:4', 'bg:primary'],
});

// ❌ Typo in property name rejected
css({
  a: {
    // @ts-expect-error — 'bacgroundColor' is not a CSS property
    bacgroundColor: 'red',
  },
});

// ❌ Selector without leading & rejected
css({
  a: {
    color: 'red',
    // @ts-expect-error — 'hover' is neither a property nor a selector key
    hover: { color: 'blue' },
  },
});

// ❌ Unknown block access rejected
const styles = css({ panel: { color: 'red' } });
// @ts-expect-error — 'nonexistent' is not a block in the input
styles.nonexistent;

// ❌ Unknown variant option rejected
const btn = variants({
  base: {},
  variants: { intent: { primary: {}, ghost: {} } },
});
// @ts-expect-error — 'danger' is not an option for 'intent'
btn({ intent: 'danger' });

// ❌ Removed exports
// @ts-expect-error — s no longer exported
import { s } from '@vertz/ui';

// @ts-expect-error — UtilityClass no longer exported
import type { UtilityClass } from '@vertz/ui';
```

## Implementation Plan

### Phase 1: New input shape end-to-end (runtime + compiler + one real consumer)

This is the thinnest vertical slice. It includes both runtime and Rust compiler extraction from day one — "runtime-only" is not a shippable slice because static `css()` calls in user code are compiled, and a runtime fallback would produce duplicate classes that diverge from compiled output.

**Deliverables:**

- `packages/ui/src/css/style-block.ts` — new `StyleBlock` type (see Type Flow Map).
- `packages/ui/src/css/css.ts` — `css()` overload accepts `Record<string, StyleBlock>`; existing array form retained transiently with `@deprecated` JSDoc (deleted in Phase 5).
- `packages/ui/src/css/variants.ts` — `base`, variant options, `compoundVariants[i].styles` widened to `StyleBlock` (also retaining array form with `@deprecated`).
- `packages/ui/src/css/class-generator.ts` — object-form walker; reuses the existing nested-escape-hatch path.
- `packages/ui/src/css/__tests__/css-object-form.test.ts` — all runtime E2E tests above, written red first.
- `packages/ui/src/css/__tests__/css-object-form.test-d.ts` — all type-level E2E tests above.
- `native/vertz-compiler-core/src/css_transform.rs` — extend `extract_entries()` / `extract_blocks()` to detect top-level `ObjectExpression` input; dispatch to object-form walker that handles nested selectors and declaration properties.
- `native/vertz-compiler-core/src/css_unitless.rs` — **single source of truth**. Port `UNITLESS_PROPERTIES` from `packages/ui/src/dom/style.ts`. A `packages/ui/scripts/check-unitless-parity.ts` script diffs the two lists on `vtz run lint` and fails if they drift.
- `native/vertz-compiler-core/tests/css_extraction/object_form.rs` — Rust unit tests: top-level object, nested `&`, `@media`, numeric auto-px, custom properties.
- `packages/landing/src/components/hero.tsx` + one deep-variants fixture from `packages/theme-shadcn/src/styles/button.ts` — rewritten to object form. These are the type-inference benchmark cases for the Unknown.

**Acceptance criteria:**

```ts
describe('Phase 1: Object-form css() end-to-end', () => {
  it('runtime: all E2E object-form tests green', () => { /* above */ });
  it('compiler: extracts object-form css() to static CSS at build time', () => {
    // fixture file → compiled output contains the expected CSS
  });
  it('compiler: runtime and compiled css() produce identical class names', () => {
    // same input → same hash
  });
  it('type-inference: vtz run typecheck regression < 15% on full monorepo', () => {
    // pre/post measurement in CI
  });
  it('token-string input continues to work (transient, removed in Phase 5)', () => {});
});
```

### Phase 2: `token` helper + typed augmentation

**Depends on:** Phase 1.

**Deliverables:**

- `packages/ui/src/css/token.ts` — `Proxy` implementation, `VertzThemeTokens` interface, graceful fallback to `var(...)` strings.
- `packages/ui/src/css/__tests__/token.test.ts` — runtime behaviour (every dot path → `var(...)` string), missing-key fallback.
- `packages/ui/src/css/__tests__/token.test-d.ts` — typed augmentation fixture: `declare module '@vertz/ui'` with a concrete theme, assert typed rejection + acceptance.
- Export `token` from `packages/ui/src/css/public.ts`.
- `packages/mint-docs/guides/theming.mdx` — augmentation snippet (small doc update; full docs land in Phase 6).

**Acceptance criteria:** runtime tests and type tests green; bundle-size check (`@vertz/ui` gzip delta ≤ +250 bytes).

### Phase 3: Migrate first-party call sites

**Depends on:** Phase 1, Phase 2.

**Deliverables:**

- `scripts/migrate-classnames.ts` — one-shot rewrite script using `@vertz/native-compiler` AST. Deterministic mapping table for every `(property, valueType)` pair: e.g. `p:${N}` → `padding: token.spacing[${N}]`, `bg:${namespace}.${shade}` → `backgroundColor: token.color.${namespace}[${shade}]`, `hover:${rest}` → `'&:hover': { ...rest }`, etc. Script asserts 100% coverage or errors.
- Rewrite all first-party call sites in `packages/`, `examples/`, `sites/`.
- Rewrite all token-string test fixtures in `packages/ui/src/css/__tests__/` to equivalent object-form.
- Playwright snapshot baseline vs. pre-migration: landing routes + `components.vertz.dev` demo pages. Any diffs > 1px are justified in PR description.

**Acceptance criteria:**

- `rg "'[a-z]+:[a-z0-9.-]+'" packages sites examples | rg "(css|variants|s)\\("` returns zero hits.
- `vtz run typecheck` clean across monorepo.
- Playwright visual-parity baseline green.
- `vtz test` green across monorepo.

### Phase 4: Remove token parser, resolver, tables, and `s()`

**Depends on:** Phase 3 (zero first-party consumers left).

**Deliverables:**

- Delete `packages/ui/src/css/shorthand-parser.ts`, `token-resolver.ts`, `token-tables.ts`, `utility-types.ts`, `s.ts`.
- Delete `packages/ui-server/src/compiler/css-extraction/` token-string paths.
- Delete token-string arms from `native/vertz-compiler-core/src/css_transform.rs` — extractor rejects string literals where `StyleBlock` is expected with a clear Rust-side diagnostic.
- Narrow `css()` / `variants()` public types to object form only; remove `@deprecated` overloads.
- Remove `UtilityClass`, `StyleEntry`, `StyleValue`, `s` from `packages/ui/src/css/public.ts` and `@vertz/ui/internals`.
- `packages/ui/src/__tests__/removed-exports.test-d.ts` — negative type tests proving removal.

**Acceptance criteria:**

- `rg "parseShorthand|resolveToken|SPACING_SCALE|UtilityClass|import.*'s'.*from '@vertz/ui'" packages/ examples/ sites/` returns zero hits.
- `@vertz/ui` published bundle-size regression: ≥ 8 KB gzip reduction in `css/*`.
- Quality gates clean.

### Phase 5: Docs + changeset + retrospective

**Depends on:** Phase 4.

**Deliverables:**

- `packages/mint-docs/api-reference/ui/css.mdx` — rewrite around object-form + `token.*`. Delete every token-string example.
- `packages/mint-docs/api-reference/ui/variants.mdx` — same.
- `packages/mint-docs/guides/styling.mdx` — new top-of-funnel: object shape, nested selectors, auto-px, theme vars, `token.*`.
- Delete any mint-docs page dedicated to utility classes (e.g., `utility-classes.mdx`).
- `.changeset/drop-classname-utilities.md` — **patch** changeset (per `.claude/rules/policies.md`: every changeset = patch pre-v1). Body explicitly supersedes #1455.
- `plans/post-implementation-reviews/drop-classname-utilities.md` — retrospective.

**Acceptance criteria:**

- `vtz run build` for `packages/mint-docs` clean.
- Every code block in the new docs compiles against the new types.
- `rg "'p:|'bg:|'text:|'font:|'rounded:|'hover:" packages/mint-docs` returns zero hits.

## Developer Walkthrough

Migrating a single component:

```ts
// Before
import { css } from '@vertz/ui';
const styles = css({
  card: ['p:4', 'bg:background', 'rounded:lg', 'hover:bg:primary.50'],
  title: ['font:xl', 'weight:bold', 'text:foreground'],
});

// After
import { css, token } from '@vertz/ui';
const styles = css({
  card: {
    padding: token.spacing[4],
    backgroundColor: token.color.background,
    borderRadius: 'calc(var(--radius) * 1.33)',  // 'rounded:lg' was a calc() over --radius
    '&:hover': { backgroundColor: token.color.primary[50] },
  },
  title: {
    fontSize: 20,   // 'font:xl' resolved to 1.25rem
    fontWeight: 600,
    color: token.color.foreground,
  },
});
```

JSX, class application, SSR, HMR — all unchanged.

## Risks

- **TypeScript inference cost.** Addressed in Unknowns. Mitigation path designed in advance.
- **Mechanical rewrite introduces visual regressions.** Mitigated by Playwright baseline in Phase 3 and the script-based rewrite in Phase 3 (not hand-rewriting).
- **Auto-px table drift between TS and Rust.** Mitigated by the `check-unitless-parity.ts` lint-time check in Phase 1.
- **`token.*` misuse with computed keys.** A user writing `token.color[name]` with a runtime `name` bypasses types. Documented in the guide; the `var(...)` string is still structurally valid, so runtime behaviour is safe.
- **Third-party packages.** None exist pre-v1 — explicit per `.claude/rules/policies.md` "all packages pre-v1 — no external users." `MEMORY.md` notes external users have arrived for consumption, but no one is building on `@vertz/ui/internals` or `UtilityClass`.
