# Tech Lead Review: DB ID Generation Design

**Reviewer:** ben (Tech Lead)
**Date:** 2026-02-20
**Design Doc:** `plans/db-id-generation.md`

---

## Verdict: Request Changes

## Summary

The design is well-structured and addresses a genuine pain point. However, there are **blocking issues** with the type constraint enforcement (`.generate()` should only be available after `.primary()`) and a **significant semantic mismatch** where the current codebase makes all primary keys optional in `$create_input` (via `hasDefault: true` in `.primary()`), which contradicts the design's stated intent that "user must provide the ID" without `.generate()`.

---

## Concerns

### 1. Type-level guard for `.generate()` is not implemented (Blocking)

**Severity:** Blocking

The design states:
> ".generate(strategy) is only valid on primary key columns. Calling it on a non-primary column is a **compile-time error**"

But looking at `column.ts`, there's no TypeScript mechanism to enforce this. The current builder just returns `ColumnBuilder` with modified metadata:

```typescript
// Current pattern in column.ts - no state tracking
primary() {
  return cloneWith(this, { primary: true, hasDefault: true }) as ReturnType<...>;
}
```

**What's needed:** The design mentions "TypeScript overloads" and "type parameter to track state", but doesn't specify the implementation. This requires a significant change to the builder's type signature to track whether the column is primary. A typical pattern would be:

```typescript
// Conceptual - needs significant refactoring
type NonPrimaryColumn<T> = ColumnBuilder<T> & { 
  primary(): PrimaryColumn<T>;
  // .generate() NOT available
};

type PrimaryColumn<T> = ColumnBuilder<T> & { 
  generate(strategy: IdStrategy): GeneratedPrimaryColumn<T>;
  // .generate() IS available
};
```

This is a substantial type engineering task that should be prototyped before approval.

---

### 2. Current `.primary()` sets `hasDefault: true`, making PKs optional in `$create_input` (Blocking)

**Severity:** Blocking

The design says:
> ".primary() without .generate() keeps current behavior — user must provide the ID."

But looking at `column.ts` line 130:
```typescript
primary() {
  return cloneWith(this, { primary: true, hasDefault: true });
}
```

And in `table.ts`, `ApiCreateInput` makes columns with `hasDefault: true` optional:
```typescript
type ApiCreateInput<T> = {
  // Required: not hasDefault
} & {
  // Optional: hasDefault
};
```

**Current state:** A column defined as `d.text().primary()` is already optional in `$create_input` types, with no generation happening at runtime. This means users get no compile-time error (type says optional) but will get a runtime error (DB requires the value).

**Design inconsistency:** The design claims `.generate()` "also sets `hasDefault: true`, so the types are consistent" — but `.primary()` ALREADY sets it, so there's no difference! The design appears to misunderstand the current behavior.

**Fix required:** Either:
- (a) Remove `hasDefault: true` from `.primary()` so PKs are required in `$create_input`, and only add it when `.generate()` is called, OR
- (b) Acknowledge that PKs are already optional and this is "working as intended" (but then the design's point #4 is wrong)

---

### 3. No validation that `.generate()` is only used on string/UUID column types (Important)

**Severity:** Important

The design acknowledges:
> ".generate() only makes sense on text/uuid columns. Calling it on d.integer().primary() is a type error"

But there's no implementation of this constraint. Any column type can currently call `.generate()`. This requires the same type-level state tracking as concern #1.

---

### 4. `type-gen.ts` is the wrong file to check — `$create_input` lives in `table.ts` (Minor)

**Severity:** Minor

The design says to check `type-gen.ts` for type changes. But `type-gen.ts` is a codegen utility for generating types from domain definitions. The actual `$create_input` type is defined in `table.ts` (lines 109-127).

That said, the design is correct that **no changes are needed** — the existing `hasDefault` mechanism in `table.ts` handles the optionality correctly. The issue is understanding the current behavior (see #2).

---

### 5. `createMany` needs unique ID per row — design is correct, but implementation detail is light (Minor)

**Severity:** Minor

The design states IDs are generated per-row in `createMany`, which is correct. However, the pseudocode in the design doesn't show the actual implementation:

```typescript
// Pseudocode shows simple loop, but actual implementation needs:
// 1. Access to table._columns metadata
// 2. Each row gets a NEW generated ID (not same ID for all rows)
// 3. Performance consideration: generating 1000 IDs synchronously
```

This is doable but worth noting — the loop needs to generate fresh IDs, not reuse the same one.

---

## What's Good

1. **Correct placement in `crud.ts`** — ID generation logically belongs in the CRUD layer before INSERT, not in the SQL builder or schema layer.

2. **User-provided IDs respected** — The design correctly checks for `undefined` before generating, preserving explicit values.

3. **Dependency strategy is sound** — Using `crypto.randomUUID()` for UUID (v7) is good. Cuid2 and nanoid are appropriate choices. Lazy loading isn't needed for these small packages.

4. **Non-breaking change** — The migration path is clean. Existing code continues to work.

5. **Handles edge cases** — Composite keys, non-text PKs (via type errors), transactions all addressed.

6. **No entity layer changes needed** — Good that `@vertz/server` doesn't need modification.

---

## Recommended Changes Before Approval

1. **Prototype the TypeScript type constraints** — Prove that `.generate()` can be restricted to only work after `.primary()` and only on text/uuid columns. This is the hardest part of the implementation.

2. **Decide on hasDefault behavior** — Either:
   - Remove `hasDefault: true` from `.primary()` so PKs are required by default
   - Or explicitly document that PKs are already optional in `$create_input` and this is intentional

3. **Add implementation details for `createMany`** — Show exactly how the per-row generation loop works with the `table._columns` metadata access.
