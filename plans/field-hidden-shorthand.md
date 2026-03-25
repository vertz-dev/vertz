# Design: `.hidden()` Shorthand on Column Builders

## Problem

`hidden` is the most common annotation in the codebase. Every table with sensitive fields (password hashes, internal tokens, API keys) uses `.is('hidden')`. The original `.hidden()` method was removed in #802 when we introduced the general-purpose `.is()` method, but the ergonomic cost is felt on every schema definition:

```ts
// Current — verbose for the most common annotation
passwordHash: d.text().is('hidden'),
refreshToken: d.text().is('hidden'),
apiSecret: d.text().is('hidden'),

// Proposed — first-class shorthand
passwordHash: d.text().hidden(),
refreshToken: d.text().hidden(),
apiSecret: d.text().hidden(),
```

## API Surface

```ts
// On ColumnBuilder<TType, TMeta>
hidden(): ColumnBuilder<
  TType,
  Omit<TMeta, '_annotations'> & {
    readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
  }
>;

// On StringColumnBuilder<TType, TMeta>
hidden(): StringColumnBuilder<
  TType,
  Omit<TMeta, '_annotations'> & {
    readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
  }
>;

// On NumericColumnBuilder<TType, TMeta>
hidden(): NumericColumnBuilder<
  TType,
  Omit<TMeta, '_annotations'> & {
    readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
  }
>;
```

### Chaining

```ts
d.text().hidden()                    // ✅ basic usage
d.text().hidden().nullable()         // ✅ hidden + nullable
d.text().nullable().hidden()         // ✅ order doesn't matter
d.text().hidden().is('patchable')    // ✅ combines with .is()
d.text().is('sensitive').hidden()    // ✅ accumulates annotations
d.integer().hidden().min(0).max(100) // ✅ works on numeric builders
d.email().hidden().min(5)            // ✅ works on string builders
```

### Runtime

```ts
// Implementation — delegates to .is('hidden')
hidden() {
  return this.is('hidden');
}
```

## Manifesto Alignment

- **Principle: Obvious code** — `.hidden()` is more discoverable than `.is('hidden')`. Developers don't need to know the annotation string.
- **Principle: Type safety** — Same type-level guarantees as `.is('hidden')`. The return type properly narrows `_annotations`.
- **Principle: Composable** — `.hidden()` composes with all existing builder methods. It's sugar over `.is()`, not a parallel mechanism.
- **Precedent: `.readOnly()`** — The builder already has first-class shorthands for common operations (`.readOnly()`, `.autoUpdate()`, `.nullable()`, `.unique()`). `.hidden()` follows the same pattern — single-word verb methods for high-frequency operations.
- **Principle: AI agents are first-class users** — `.hidden()` is unambiguous for autocomplete and LLM code generation. `.is('hidden')` requires knowing the exact annotation string.

## Non-Goals

- **Not adding other shorthand methods** — `.sensitive()`, `.patchable()`, etc. remain as `.is('sensitive')`. The bar for a shorthand is that the annotation appears in nearly every schema definition. `hidden` (~63 occurrences) clears this bar. `sensitive` (~18) and `patchable` (~2) do not.
- **Not deprecating `.is('hidden')`** — Both forms work. `.is()` remains the general-purpose mechanism.
- **Not changing runtime behavior** — `hidden` annotation semantics (response filtering, type exclusion) are unchanged.

## Unknowns

None identified. This is a pure sugar addition with no new concepts.

## Type Flow Map

```
d.text().hidden()
  → ColumnBuilder<string, DefaultMeta<'text'>>
  → .hidden() returns ColumnBuilder<string, { ..., _annotations: { hidden: true } }>
  → Used in d.table() → TableDef<TColumns>
  → $infer / $response exclude keys via ColumnKeysWithoutAnyAnnotation<T, 'hidden'>
  → Same flow as .is('hidden') — no new generic introduced
```

## E2E Acceptance Test

```ts
// Runtime: .hidden() sets annotation
const col = d.text().hidden();
expect(col._meta._annotations.hidden).toBe(true);

// Type-level: hidden columns excluded from $infer
const users = d.table('users', {
  id: d.uuid().primary(),
  email: d.text(),
  passwordHash: d.text().hidden(),
});
type Row = typeof users.$infer;
// Row has 'id' and 'email' but NOT 'passwordHash'

// Type-level: .hidden() equivalent to .is('hidden')
type A = typeof d.text().hidden()._meta._annotations;
type B = typeof d.text().is('hidden')._meta._annotations;
// A and B are equivalent — both have { hidden: true }

// @ts-expect-error — hidden field not in $infer
type _err = typeof users.$infer.passwordHash;
```

## Implementation Plan

### Phase 1: Add `.hidden()` to column builders

**Scope:** Add the method to all four interfaces (`ColumnBuilder`, `StringColumnBuilder`, `NumericColumnBuilder`, and the internal `ColumnBuilderImpl`) plus the runtime implementation. Update docs at `packages/mint-docs/`.

**Acceptance Criteria:**
```ts
describe('Feature: .hidden() shorthand', () => {
  describe('Given a column builder', () => {
    describe('When .hidden() is called', () => {
      it('Then sets hidden: true in _annotations', () => {});
      it('Then is equivalent to .is("hidden") at runtime', () => {});
    });
  });

  describe('Given a string column builder', () => {
    describe('When .hidden() is chained with .min()/.max()', () => {
      it('Then preserves both hidden annotation and constraints', () => {});
    });
  });

  describe('Given a numeric column builder', () => {
    describe('When .hidden() is chained with .min()/.max()', () => {
      it('Then preserves both hidden annotation and constraints', () => {});
    });
  });

  describe('Given a table with .hidden() columns', () => {
    describe('When inferring $infer type', () => {
      it('Then excludes hidden columns (same as .is("hidden"))', () => {});
    });
  });

  // Type-level
  describe('Given .hidden() on a column', () => {
    it('Then _annotations.hidden is true at the type level', () => {});
    // @ts-expect-error — false not assignable to hidden annotation
    it('Then rejects false for _annotations.hidden', () => {});
  });
});
```
