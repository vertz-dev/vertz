# Flatten Theme Override API (#1969)

## Problem

The `configureTheme()` override API requires three levels of nesting for the most common customization (color overrides):

```ts
// Current — too deeply nested
configureTheme({
  overrides: {
    tokens: {
      colors: {
        primary: { DEFAULT: 'oklch(...)' },
      },
    },
  },
});
```

The wrong path (e.g., putting `primary` directly on `overrides`) silently does nothing — no TypeScript error, no runtime warning. This violates **Principle 3** (AI agents are first-class users — can an LLM use this correctly on the first prompt?) and **Principle 1** (if it builds, it works — the wrong path shouldn't type-check).

## API Surface

### New API

```ts
// Flat color overrides — the 80% case
configureTheme({
  palette: 'zinc',
  radius: 'md',
  colors: {
    primary: { DEFAULT: 'oklch(0.55 0.2 260)', _dark: 'oklch(0.65 0.25 260)' },
    'primary-foreground': { DEFAULT: '#fff', _dark: '#fff' },
  },
});

// Zero-config still works
configureTheme();
configureTheme({ palette: 'slate' });
```

### Why `colors` instead of flat `overrides`

- `colors` is semantically clear — it says *what* you're customizing
- Parallel to `palette` and `radius` — all top-level config keys describe their purpose
- Future-proof: if we add `spacing` or `typography` tokens later, they sit at the same level
- `overrides` was generic and needed the `tokens.colors` disambiguation that's no longer necessary

### Breaking change: `overrides` removed

The old `overrides.tokens.colors` path is removed entirely. No backward-compat shim (per policies — all packages pre-v1, breaking changes encouraged).

**Migration:**
```ts
// Before
configureTheme({ overrides: { tokens: { colors: { primary: { DEFAULT: '#7c3aed' } } } } })

// After
configureTheme({ colors: { primary: { DEFAULT: '#7c3aed' } } })
```

### TypeScript type

```ts
export interface ThemeConfig {
  palette?: PaletteName;
  radius?: 'sm' | 'md' | 'lg';
  style?: ThemeStyle;
  /** Color token overrides — deep-merged into the selected palette. */
  colors?: Record<string, Record<string, string> | undefined>;
}
```

The type remains `Record<string, ...>` (not a union of known token names) because:
1. Users can add custom tokens (e.g., `'brand-accent'`)
2. Token names vary by palette
3. A closed union would break extensibility

The key safety improvement is *removing the wrong path* — there's no `overrides` to put things into incorrectly anymore. The only color-related key is `colors`, and it accepts exactly the right shape.

## Manifesto Alignment

- **Principle 1 (if it builds, it works):** Removing `overrides` eliminates the silent-failure path. The only way to pass color tokens is the correct flat `colors` key.
- **Principle 2 (one way to do things):** Single, obvious API — no nesting ambiguity.
- **Principle 3 (AI agents are first-class):** LLMs will guess `colors: { primary: ... }` naturally. The 3-level nesting was the classic trap.

## Non-Goals

- **Typed union of token names** — would break custom token extensibility. Not pursuing.
- **Runtime warning for unknown keys** — TypeScript excess property checking already handles this for literal objects. Runtime validation adds overhead for minimal benefit.
- **Token categories beyond colors** — future work. `spacing`, `typography`, etc. will be added when needed.

## Unknowns

None identified. This is a straightforward API flattening with no architectural risk.

## POC Results

Not needed — the change is mechanical: rename a config key and move the access path one level up.

## Type Flow Map

```
ThemeConfig.colors → configureThemeBase() → deepMergeTokens(baseTokens, colors) → defineTheme({ colors: merged }) → Theme
```

Single generic-free path. `colors` is `Record<string, Record<string, string> | undefined>` throughout.

## E2E Acceptance Test

```ts
// Flat colors work
const { theme } = configureTheme({
  colors: { primary: { DEFAULT: '#7c3aed' } },
});
const compiled = compileTheme(theme);
expect(compiled.css).toContain('#7c3aed');

// Custom tokens work
const { theme: t2 } = configureTheme({
  colors: { 'brand-accent': { DEFAULT: '#ff6b6b', _dark: '#ee5a5a' } },
});
expect(compileTheme(t2).css).toContain('#ff6b6b');

// @ts-expect-error — old overrides path no longer exists
configureTheme({ overrides: { tokens: { colors: { primary: { DEFAULT: '#000' } } } } });
```

## Implementation Plan

### Phase 1: Flatten the API

**Changes:**

1. **`packages/theme-shadcn/src/base.ts`** — Replace `overrides.tokens.colors` with `colors` in `ThemeConfig` and `configureThemeBase()`. Add JSDoc `@example` on the `colors` property.
2. **`packages/theme-shadcn/src/types.ts`** — Remove dead `DeepPartial` type (unused artifact of old overrides infra).
3. **`packages/theme-shadcn/src/merge.ts`** — Update parameter name and JSDoc to reflect new naming.
4. **`packages/theme-shadcn/src/configure.ts`** — Update JSDoc on `configureTheme()` to not say "applies overrides".
5. **`packages/theme-shadcn/src/__tests__/configure.test.ts`** — Update override test to use `colors`.
6. **`packages/integration-tests/src/__tests__/theme-shadcn-walkthrough.test.ts`** — Update override tests to use `colors`.
7. **`sites/component-docs/src/hooks/use-customization.ts`** — Update `generateConfig()` to emit flat `colors` instead of nested `overrides`.
8. **`sites/component-docs/src/__tests__/theme-customization.test.ts`** — Update test assertions for new generated config format.
9. **`packages/mint-docs/guides/ui/component-library.mdx`** — Add `colors` option to theme configuration docs.

**Acceptance Criteria:**

```ts
describe('Feature: Flat color overrides', () => {
  describe('Given configureTheme with colors key', () => {
    describe('When compiling the theme', () => {
      it('Then the override color appears in compiled CSS', () => {});
    });
  });

  describe('Given configureTheme with custom token via colors', () => {
    describe('When compiling the theme', () => {
      it('Then the custom token appears in compiled CSS', () => {});
    });
  });

  describe('Given configureTheme with old overrides path', () => {
    describe('When TypeScript compiles', () => {
      it('Then the overrides key is a type error', () => {});
    });
  });

  describe('Given generateConfig with accent override', () => {
    describe('When generating config string', () => {
      it('Then emits flat colors key, not nested overrides', () => {});
    });
  });
});
```
