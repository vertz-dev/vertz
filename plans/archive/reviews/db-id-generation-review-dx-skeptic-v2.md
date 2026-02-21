# DX Review: Auto ID Generation Design v2

**Reviewer:** DX Skeptic  
**Date:** 2026-02-20  
**Doc:** `plans/db-id-generation.md` (v2)

---

## Verdict

**Approve with Changes**

## Summary

The v2 design successfully addresses the blocking chain-order sensitivity concern from v1 by moving `generate` inside `.primary({ generate: 'cuid' })`. This is intuitive and LLM-friendly. A few minor refinements—mainly around naming consistency and documentation—would make it excellent.

---

## Previous Concerns Status

### ✅ Addressed

1. **Chain Order Sensitivity (Blocking)** — The v1 design required `.primary().generate('cuid')`, which was fragile and confusing. The v2 approach `.primary({ generate: 'cuid' })` solves this elegantly. No order dependency, single method call.

2. **Missing compile-time error for non-primary `.generate()`** — TypeScript overloads for string vs number columns prevent `d.integer().primary({ generate: 'cuid' })` at compile time.

### ⚠️ Partially Addressed

3. **Discoverability (Important)** — Improved since `generate` is now a visible option in `.primary()` autocomplete, but still no JSDoc hinting at the option for developers who don't know to look.

4. **Strategy naming ambiguity (Minor)** — The design doc still uses "strategy" terminology (`generateStrategy` property). The v1 suggestion to use clearer naming wasn't adopted, but it's now less impactful since users interact with `.primary({ generate: 'cuid' })` rather than the internal property name.

### ❌ Not Addressed (Minor)

5. **Runtime validation message** — Still a minor concern; the error `Unknown ID strategy: ${strategy}` is adequate but could be friendlier.

---

## New Concerns

### 1. Property name inconsistency: `generateStrategy` vs `generate`
**Severity:** Minor

The design doc introduces `generateStrategy` as the metadata property name:

```typescript
// In ColumnMetadata
readonly generateStrategy?: IdStrategy;
```

But the user-facing API uses `generate`:
```typescript
d.text().primary({ generate: 'cuid' })
```

For consistency and LLM-friendliness, the internal property should match. Consider renaming to just `generate` in the metadata interface.

### 2. No JSDoc on `.primary()` options parameter
**Severity:** Minor

Developers typing `.primary(` won't see what options are available. Adding JSDoc would improve discoverability:

```typescript
primary(options?: { generate?: IdStrategy }): ColumnBuilder<...>;
// Add JSDoc: "@param options.generate - ID generation strategy: 'cuid' | 'uuid' | 'nanoid'"
```

### 3. No shorthand for "default strategy"
**Severity:** Minor

Currently you must specify `.primary({ generate: 'cuid' })`. Consider allowing `.primary({ generate: true })` as shorthand for the default (cuid), though this is a nice-to-have.

### 4. Error message could guide more
**Severity:** Minor

The runtime error "Unknown ID strategy" is functional but could say:
> "Unknown ID strategy: 'xyz'. Supported strategies are: 'cuid', 'uuid', 'nanoid'."

---

## What's Good

- **Intuitive API** — `.primary({ generate: 'cuid' })` reads naturally and matches how other frameworks handle options
- **No chain-order issues** — Solves the v1 blocking concern completely
- **TypeScript-first** — Compile-time errors for invalid combinations (e.g., integer + generate) prevent runtime surprises
- **Sensible defaults** — Cuid as default is the right choice; sensible strategy options
- **User values respected** — Explicit IDs always win, which is critical for testing and migrations
- **Clean runtime implementation** — Generation in `crud.ts` before INSERT is the right place
- **Non-breaking** — Existing code works unchanged; opt-in design
- **Good edge case handling** — Composite keys, transactions, upserts all considered
- **Zero entity layer changes** — Strong indicator of good abstraction boundaries

---

## Recommendations

1. **Rename `generateStrategy` to `generate`** in `ColumnMetadata` for internal/external consistency
2. **Add JSDoc** to the `options` parameter in `.primary()` declaration
3. Consider adding a runtime check with a more helpful error message if an invalid strategy somehow gets through
4. (Optional) Support `{ generate: true }` as shorthand for default strategy

---

## Conclusion

The v2 design is a significant improvement over v1 and solves the core DX concerns. The API is intuitive, discoverable (via autocomplete), and LLM-friendly. The few minor issues listed above are polish items rather than blockers. **Approve with Changes** — the changes are optional refinements.
