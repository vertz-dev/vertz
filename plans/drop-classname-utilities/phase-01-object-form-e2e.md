# Phase 1: Object-form `css()` / `variants()` end-to-end

## Context

We're dropping the tailwind-ish token-string vocabulary (`'p:4'`, `'bg:primary'`, `'hover:bg:primary.700'`) from `css()` and `variants()`. Developers write plain CSS-property objects (camelCase) instead — e.g. `{ padding: 16, backgroundColor: 'var(--color-primary-600)' }`. Theme tokens are raw `var(--…)` strings; a typed `token.*` helper ships in Phase 2.

This phase lands the object-form input shape **end-to-end**: new types, runtime walker, Rust compiler extractor, single source of truth for auto-px, and one rewritten real consumer (`packages/landing/src/components/hero.tsx`).

The token-string shape remains accepted transiently so the monorepo keeps compiling; it's deleted in Phase 4. First-party migration at scale happens in Phase 3.

Full design doc: `plans/drop-classname-utilities.md`.

## Key prior art

- `packages/ui/src/dom/style.ts` — shipped `styleObjectToString()`, source of truth for the current `UNITLESS` Set and camelCase→kebab conversion. We extract the Set to a shared module and import from both sides.
- `packages/ui/src/css/css.ts` — runtime `css()` already dispatches on entry type in `for (const entry of entries)`. Object-form at the top level swaps the loop structure: each block is now a single object instead of an array of entries.
- `packages/ui/src/css/css-properties.ts` — `CamelCSSDeclarations` already exists. We widen its value type to `string | number` for the new `StyleBlock`.
- `native/vertz-compiler-core/src/css_transform.rs` — `extract_entries()` currently expects an `ArrayExpression`. Extend it to also accept `ObjectExpression` as top-level block value.

## Tasks

### Task 1: `StyleBlock` type + widened declarations type

**Files:** (2)
- `packages/ui/src/css/style-block.ts` (new)
- `packages/ui/src/css/__tests__/style-block.test-d.ts` (new)

**What to implement:**

Define the object-form input type for scoped-styles:

```ts
// packages/ui/src/css/style-block.ts
import type { CamelCSSPropertyName } from './css-properties';

/** CSSDeclarations with string | number values (numbers auto-px per auto-px table). */
export type StyleDeclarations = {
  [K in CamelCSSPropertyName]?: string | number;
} & {
  [K in `-${string}` | `Webkit${string}` | `Moz${string}` | `Ms${string}`]?: string | number;
};

/** Nested-selector key: & or @ prefixed. */
export type SelectorKey = `&${string}` | `@${string}`;

/** A block in a css() call or a variant option: CSS declarations + nested selectors. */
export type StyleBlock = StyleDeclarations & {
  [K in SelectorKey]?: StyleBlock;
};
```

Self-reference of `StyleBlock` inside the selector index signature is intentional — TS supports this since 4.9 for template-literal index signatures. Verify with a type test.

**Acceptance criteria:**

- [ ] `StyleBlock` compiles with nested selectors (1, 2, 3 levels deep).
- [ ] `.test-d.ts` asserts:
  - `{ padding: 16, backgroundColor: 'red' }` assignable to `StyleBlock`.
  - `{ '&:hover': { color: 'blue' } }` assignable.
  - `{ '@media (min-width: 768px)': { padding: 24 } }` assignable.
  - `{ bacgroundColor: 'red' }` rejected (`@ts-expect-error`).
  - `{ hover: {} }` rejected (`@ts-expect-error` — missing `&`).
  - `{ ':root': {} }` rejected (`@ts-expect-error` — `&` or `@` only).
  - `{ padding: true }` rejected.
  - Numeric value accepted: `{ opacity: 0.5 }`.
  - Custom property accepted: `{ '--my': 'red' }`.

---

### Task 2: Shared `UNITLESS_PROPERTIES` module

**Files:** (3)
- `packages/ui/src/css/unitless-properties.ts` (new, exports `UNITLESS_PROPERTIES: ReadonlySet<string>` and `isUnitless(name: string): boolean`)
- `packages/ui/src/dom/style.ts` (modify: import `UNITLESS_PROPERTIES` instead of local `UNITLESS`; no other behaviour change)
- `packages/ui/src/css/__tests__/unitless-properties.test.ts` (new)

**What to implement:**

Extract the 43-property `UNITLESS` Set from `packages/ui/src/dom/style.ts` into a shared module. Re-import from the existing call site. Export `UNITLESS_PROPERTIES` (the Set) and `isUnitless(name)` (helper) from `packages/ui/src/css/index.ts` so both the runtime walker (Task 3) and the parity script (Task 6) can consume it.

**Acceptance criteria:**

- [ ] `UNITLESS_PROPERTIES.has('opacity')` → `true`.
- [ ] `UNITLESS_PROPERTIES.has('padding')` → `false`.
- [ ] `styleObjectToString()` in `dom/style.ts` behaves identically to before — all existing style tests still pass.
- [ ] No duplicate unitless list remains in the TS codebase.

---

### Task 3: Runtime object-form walker in `css()`

**Files:** (3)
- `packages/ui/src/css/css.ts` (modify)
- `packages/ui/src/css/__tests__/css-object-form.test.ts` (new)
- `packages/ui/src/css/public.ts` (export `StyleBlock`, `SelectorKey`, `StyleDeclarations`)

**What to implement:**

Add an object-form input type as a sibling to the existing `CSSInput`:

```ts
export type CSSInput = Record<string, StyleEntry[]>;              // existing — token-string array form
export type CSSInputObject = Record<string, StyleBlock>;          // new — object form
```

The `css()` function accepts either shape. At runtime it dispatches per block:
- If `Array.isArray(blockValue)` → existing array-entry path.
- Else (plain object) → new object-form walker.

The object-form walker:
1. Separate own-property entries into CSS-property keys vs. selector keys (`&*` / `@*`).
2. Build declarations for the base rule by iterating property keys, kebab-casing each, and formatting the value — numeric values get `px` suffix unless the camelCase key is in `UNITLESS_PROPERTIES`, unless value is `0` (always bare), unless key starts with `--` (passthrough).
3. Recursively handle selector keys — `&…` replaced with `.${className}`, `@…` wraps the class selector inside the at-rule, nested `StyleBlock` values process recursively.

`serializeEntries()` gets an object-form sibling `serializeBlock()` that produces deterministic output (sorted keys, recursed on nested selectors).

Update `CSSOutput<T>` to work with either input shape (generic already uses `keyof T & string`, so widening `T` to `Record<string, unknown>` keeps it inferring correctly).

**Acceptance criteria** (write as RED tests first):

- [ ] `css({ panel: { backgroundColor: 'var(--color-background)', padding: 24 } })` returns `styles.panel` (string) and `styles.css` contains `background-color: var(--color-background)` and `padding: 24px`.
- [ ] Numeric auto-px: `{ padding: 16, opacity: 0.5, zIndex: 10, margin: 0, lineHeight: 1.4 }` produces `padding: 16px`, `opacity: 0.5`, `z-index: 10`, `margin: 0` (not `0px`), `line-height: 1.4`.
- [ ] Custom properties: `{ '--my-var': 'red', color: 'var(--my-var)' }` emits both.
- [ ] Nested `&`: `{ color: 'white', '&:hover': { color: 'blue' } }` emits `.<cls> { color: white } .<cls>:hover { color: blue }`.
- [ ] Nested `@media`: `{ '@media (min-width: 768px)': { padding: 16 } }` emits `@media (min-width: 768px) { .<cls> { padding: 16px } }`.
- [ ] Deeply nested: `{ '&:hover': { '&[data-state="open"]': { color: 'red' } } }` resolves both selectors stacked.
- [ ] Hash stability: reordering keys (`{ padding: 16, color: 'red' }` vs `{ color: 'red', padding: 16 }`) produces the same `styles.x` class name.
- [ ] Back-compat: existing array-form tests remain green.

---

### Task 4: Object-form in `variants()`

**Files:** (3)
- `packages/ui/src/css/variants.ts` (modify)
- `packages/ui/src/css/__tests__/variants-object-form.test.ts` (new)
- `packages/ui/src/css/__tests__/variants-object-form.test-d.ts` (new)

**What to implement:**

Widen `VariantsConfig`:

```ts
export interface VariantsConfig<V extends VariantDefinitions> {
  base: StyleEntry[] | StyleBlock;                                          // widened
  variants: V;                                                              // V values now accept StyleBlock too (see below)
  defaultVariants?: { [K in keyof V]?: keyof V[K] };
  compoundVariants?: CompoundVariant<V>[];
}
type CompoundVariant<V extends VariantDefinitions> = {
  [K in keyof V]?: keyof V[K];
} & { styles: StyleEntry[] | StyleBlock };                                  // widened
```

`VariantDefinitions` changes from `Record<string, Record<string, unknown[]>>` to `Record<string, Record<string, unknown[] | StyleBlock>>`.

At runtime, for each `base`, variant option, and compound variant `styles` value, detect shape (array vs plain object) and route to the right walker. Reuse the Task 3 object walker.

`deriveConfigKey()` gets object-form handling (sorted keys, recursive).

**Acceptance criteria:**

- [ ] `variants({ base: { display: 'flex' }, variants: { intent: { primary: { backgroundColor: 'red' } } } })` returns a `VariantFunction<V>` — calling it with `{ intent: 'primary' }` returns a class string that includes styles for both `base` and `intent.primary`.
- [ ] Compound variants with object `styles` work.
- [ ] Mixed (array base, object variants) works — transient interop during migration.
- [ ] `.test-d.ts` asserts typo rejection on property names and unknown variant-prop.
- [ ] Existing `variants.test.ts` stays green.

---

### Task 5: Rust extractor for top-level object form

**Files:** (4)
- `native/vertz-compiler-core/src/css_transform.rs` (modify)
- `native/vertz-compiler-core/src/css_unitless.rs` (new)
- `native/vertz-compiler-core/tests/object_form_extraction.rs` (new)
- `native/vertz-compiler-core/src/lib.rs` (wire module if needed)

**What to implement:**

Extend `extract_entries()` / `extract_blocks()` to detect `ObjectExpression` as a top-level block value (sibling to the existing `ArrayExpression` handling). On object input:

1. Iterate properties; classify key as CSS property (camelCase → kebab) or selector (`&…` / `@…`).
2. CSS-property value: string literal or numeric literal; numeric → apply `css_unitless.rs` table for px suffix.
3. Selector value: must be `ObjectExpression`; recurse with the same walker.

Port `UNITLESS_PROPERTIES` to Rust as a `phf::Set<&'static str>` (we already use `phf` in `css_token_tables.rs`). Single source of truth enforced by Task 6's parity script.

Emit the same hash-stable class-name format as the runtime. The hash input is the serialized block (sorted property keys, stable recursion order) + file path + block name — matching the TS `serializeEntries`/`serializeBlock` output byte-for-byte.

Rust unit tests cover every shape in Task 3's acceptance list. Must produce the same CSS text as the runtime walker for the same input.

**Acceptance criteria:**

- [ ] Rust test fixture with object-form top-level input extracts to expected CSS string.
- [ ] Numeric auto-px in Rust matches runtime behaviour.
- [ ] Nested `&` + `@media` extraction matches runtime output.
- [ ] `cargo test --all` clean.
- [ ] For the same `ObjectExpression` AST input, the Rust-produced class name equals the TS runtime's class name (parity test: compile a fixture, run it through both paths, assert hashes match).

---

### Task 6: Auto-px parity check (lint gate)

**Files:** (2)
- `packages/ui/scripts/check-unitless-parity.ts` (new)
- `packages/ui/package.json` (add `lint:unitless-parity` script; wire into `scripts/verify.ts` or `vtz run lint` pre-step)

**What to implement:**

Script reads:
- TS: `UNITLESS_PROPERTIES` from `packages/ui/src/css/unitless-properties.ts`.
- Rust: `UNITLESS_PROPERTIES` static in `native/vertz-compiler-core/src/css_unitless.rs` (parsed with a regex over the literal list — simpler than wiring napi for this tiny check).

Compares the two sets; exits 1 with a diff if they drift.

Wire into the nearest CI gate — either `packages/ui/package.json`'s `lint` script, or the monorepo-level `scripts/` entry point used by `vtz run lint`.

**Acceptance criteria:**

- [ ] Running the script with matching lists exits 0.
- [ ] Manually removing an entry from the Rust file and re-running exits 1 with a diff.
- [ ] Called as part of `vtz run lint`.

---

### Task 7: Rewrite `hero.tsx` as walkthrough + perf baseline

**Files:** (3)
- `packages/landing/src/components/hero.tsx` (rewrite `css()` / `variants()` calls to object form)
- `reviews/drop-classname-utilities/phase-01-perf-baseline.md` (new — records `vtz run typecheck` time before and after)
- No more than one sibling landing component if needed for visual parity

**What to implement:**

Convert the heaviest `css()` call site in the landing package (`hero.tsx` has ~100 token strings per earlier scouting) to object form, using raw `var(--…)` references for theme tokens (the typed `token.*` helper is Phase 2). Preserve visual output (eyeball locally; Playwright parity is Phase 3 when the migration scope is full).

Benchmark `vtz run typecheck` on `packages/landing` before and after; record in the perf baseline file. Budget: < 15% regression on this single package.

**Acceptance criteria:**

- [ ] `hero.tsx` uses only object-form `css()` / `variants()`.
- [ ] `vtz test`, `vtz run typecheck`, `vtz run lint` pass on `packages/landing`.
- [ ] Perf baseline recorded. If regression > 15%, STOP and design the recursion-depth cap mitigation documented in `plans/drop-classname-utilities.md` under Unknowns.

---

## Phase Acceptance Criteria (integration-level)

All must be green before Phase 1 is considered done:

```ts
describe('Feature: Object-form css() / variants() end-to-end', () => {
  describe('Runtime', () => {
    it('compiles object-form css() to the expected CSS text', () => { /* Task 3 */ });
    it('numeric auto-px matches inline style prop behaviour', () => { /* Task 3 */ });
    it('nested & and @media selectors resolve correctly', () => { /* Task 3 */ });
    it('variants() with object-form base + options works', () => { /* Task 4 */ });
    it('token-string input still works (transient)', () => { /* Task 3 back-compat */ });
  });

  describe('Compiler', () => {
    it('extracts object-form css() to static CSS at build time', () => { /* Task 5 */ });
    it('produces identical class names to the runtime', () => { /* Task 5 parity */ });
  });

  describe('Quality gates', () => {
    it('vtz test && vtz run typecheck && vtz run lint clean monorepo-wide', () => {});
    it('cargo test --all && cargo clippy --all-targets -- -D warnings clean', () => {});
    it('tsc time regression < 15% on the landing package (perf baseline recorded)', () => { /* Task 7 */ });
    it('unitless parity script passes', () => { /* Task 6 */ });
  });
});
```

Then write the adversarial review in `reviews/drop-classname-utilities/phase-01.md` before moving to Phase 2.
