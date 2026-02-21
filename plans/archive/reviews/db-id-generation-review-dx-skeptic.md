# DX Review: Auto ID Generation Design

**Reviewer:** DX Skeptic  
**Date:** 2026-02-20  
**Doc:** `plans/db-id-generation.md`

---

## Verdict

**Request Changes**

## Summary

The design solves a real pain point but introduces a **chain-order dependency** that violates the "if it confuses an LLM, it confuses a junior dev" principle. Developers must call `.generate()` *after* `.primary()`, which is non-obvious and will cause friction. The API should either make `.generate()` order-agnostic or provide clear guidance.

---

## Concerns

### 1. Chain Order Sensitivity — `.generate()` must follow `.primary()`
**Severity:** Blocking

The design explicitly requires `.generate()` to be called **after** `.primary()`. This is a fragile API contract:

```typescript
// This works
d.text().primary().generate('cuid')

// This looks equally valid but fails (compile error)
d.text().generate('cuid').primary()
```

An LLM or junior dev might intuitively write the second form (generate first, then declare it's the primary key) and be confused why it doesn't work. The current column builder doesn't enforce strict ordering for `.primary()`/`.unique()`/`.nullable()`, so this is an inconsistent pattern.

**Recommendation:** Either:
- Make `.generate()` work regardless of chain position (absorb the `.primary()` requirement internally)
- Or clearly document the ordering constraint with a prominent JSDoc/TypeScript error message showing the correct order

### 2. Discoverability — How do users find `.generate()`?
**Severity:** Important

There's no discoverability path. A developer browsing `d.text()` or looking at TypeScript autocomplete won't see `.generate()` as an option until they've already called `.primary()`.

**Recommendation:** Add JSDoc to every column type that hints at `.generate()` for primary keys, or add a top-level `d.id()` builder for clarity.

### 3. Missing clear error for non-primary `.generate()` call
**Severity:** Important

The design mentions "compile-time error" with "TypeScript overload that returns `never` with a message," but it's unclear how the error message actually communicates the fix.

**Recommendation:** Ensure the TypeScript error clearly says something like:
> "`.generate()` is only available on primary key columns. Add `.primary()` before `.generate()`."

### 4. Strategy naming ambiguity
**Severity:** Minor

`'cuid'`, `'uuid'`, `'nanoid'` are clear, but `.generate()` takes a `strategy` parameter. The term "strategy" is slightly abstract. Consider renaming to `idType` or `idFormat` for immediate clarity.

### 5. No runtime validation message for invalid strategy
**Severity:** Minor

The design shows:
```typescript
if (!gen) throw new Error(`Unknown ID strategy: ${strategy}`);
```

This error message is fine, but it only appears at runtime. If TypeScript overloads fail to prevent misuse, users hit this error instead of a compile-time fix.

---

## What's Good

- **Solving a real pain point:** Automatic ID generation removes repetitive `createId()` boilerplate
- **Sensible defaults:** Cuid is the default, which is the right choice for most use cases
- **User-provided IDs respected:** The design correctly prioritizes user values over auto-generation
- **TypeScript-first enforcement:** Compile-time errors for non-primary columns prevent runtime surprises
- **Clean runtime implementation:** Generation in `crud.ts` before INSERT is the right place
- **Non-breaking migration:** Existing code continues to work; opt-in design allows gradual adoption

---

## Additional Notes

- The dependency handling (eager vs lazy imports) is well-thought-out
- Composite primary key support is a nice edge case consideration
- The decision to exclude `ulid` and auto-increment is defensible
- Entity layer needing zero changes is a strong indicator of good design

---

## Summary Action Items

1. **Make `.generate()` order-agnostic** (or clearly document the constraint in TypeScript errors)
2. **Add JSDoc hints** for discoverability on column types
3. **Verify error messages** clearly guide users to the fix
4. Consider renaming `strategy` to `idType` for LLM-friendliness
