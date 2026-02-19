# DX Review: result-boundaries.md (v3)

**Reviewer:** DX Review Subagent  
**Date:** 2026-02-18  
**File:** `/Users/viniciusdacal/openclaw-workspace/vertz/plans/result-boundaries.md` (v3)  
**Context:** Reviewed against shipped `@vertz/errors` code (PR #420) and v2 DX review

---

## Executive Summary

The v3 doc shows **significant improvement** over v2. Critical issues from v2 have been addressed: the `err()` pattern now correctly uses factory functions, and the doc clearly distinguishes shipped vs proposed features. However, some issues remain, and new concerns have emerged. The doc is now more honest about what exists vs what's planned, but the complexity has increased substantially.

---

## 1. Were v2 Issues Fixed?

### ✅ Fixed

| Issue | v2 Status | v3 Status |
|-------|-----------|------------|
| `.value` vs `.data` | Fixed | **Still correct** — uses `.data` throughout |
| `err(new ForbiddenError(...))` | Wrong pattern | **Fixed** — Now uses `createForbiddenError()` factory |
| Examples ahead of code (httpStatus) | Proposed, not shipped | **Fixed** — Now clearly labeled as proposals |
| Gaps section | Added in v2 | **Expanded** — Section 7 covers more gaps |

### ⚠️ Partially Fixed

| Issue | v2 Status | v3 Status |
|-------|-----------|------------|
| PERMISSION_DENIED vs FORBIDDEN | Inconsistent | **Still inconsistent** — Doc uses `createForbiddenError` (client, code: `FORBIDDEN`) but auth domain has `PERMISSION_DENIED`. No explicit resolution. |
| flatMap not mentioned | Exists in shipped code | **Still not prominent** — Shipped code has `flatMap()` in `result.ts` but doc doesn't showcase it. `pipe()` is presented as the solution instead. |

### ❌ Not Fixed / New Issues

| Issue | Status |
|-------|--------|
| Two-Result confusion | **Still unclear** — v3 acknowledges both exist but doesn't give clear decision rule |
| pipe() vs flatMap | **New confusion** — Shipped `flatMap()` exists but doc pushes `pipe()` as new feature |

---

## 2. Learnability

### Can a junior dev follow this?

**Verdict: Partial — improved but still challenging.**

**What's Better:**
- Clearer structure with numbered decisions
- Migration phases clearly laid out (Section 8)
- Layer-by-layer contract table (Section 3)
- Code examples now use correct factory functions

**What's Worse:**
- **Doc length:** ~400 lines vs ~300 in v2. More details = more cognitive load.
- **Two-Result world:** Still confusing. Section 0 lists 4 Result types, Section 1 says "@vertz/errors wins", Section 5 mentions @vertz/core as escape hatch. Junior dev needs a simple flowchart.
- **Proposed vs Shipped:** While v3 is better at labeling proposals, a junior dev might not understand:
  - What "Phase 3-5 can ship immediately" means (these are ADDITIVE, not breaking)
  - Why some things work today vs what's being added
- **pipe() API incomplete:** Shows usage but not the full type signature (see Section 6).

**Recommendation for Learnability:**
Add a "Quick Start" at the top:
```
1. Return Result from services → use @vertz/errors
2. Need custom HTTP status → use response API directly  
3. Infrastructure fails → let it throw
```

---

## 3. LLM-Friendliness

### Can an AI agent write correct service code from this spec?

**Verdict: Mostly yes — but needs verification.**

| Aspect | Status | Notes |
|--------|--------|-------|
| Factory functions | ✅ Good | `createNotFoundError()`, `createForbiddenError()` are correct |
| `.data` property | ✅ Good | Uses correct property name |
| Result shape | ✅ Good | `{ ok: true, data }` / `{ ok: false, error }` |
| err() pattern | ✅ Good | Now correctly shows `err(createXxxError(...))` |
| HTTP mapping | ⚠️ Partial | `httpStatusForError()` doesn't exist yet — LLM needs to implement it |
| pipe() | ⚠️ Partial | Not shipped yet — LLM would need to implement or use flatMap |

### What an LLM might get wrong:

1. **HTTP_STATUS_MAP doesn't exist** — Doc shows it (lines 56-87), but it's NOT in shipped `@vertz/errors`. LLM following this doc would search for it and fail.

2. **pipe() doesn't exist** — Doc shows usage (lines 154-170), but `pipe()` is NOT in shipped code. LLM would need to either:
   - Implement it themselves, or
   - Use shipped `flatMap()` instead (which isn't mentioned prominently)

3. **Auth vs Client error codes** — Doc uses `createForbiddenError` (client, `FORBIDDEN`), but auth domain uses `PERMISSION_DENIED`. LLM might mix these up.

---

## 4. Code Examples — Do They Use ACTUAL Shipped API?

### ✅ Correct Examples

| Example | Shipped API | Status |
|---------|-------------|--------|
| `createNotFoundError('users', { id: '123' })` | ✅ Exists in `domain/db.ts` | Correct |
| `createForbiddenError('Order already shipped')` | ✅ Exists in `domain/client.ts` | Correct |
| `createPermissionDeniedError(...)` | ✅ Exists in `domain/auth.ts` | Correct |
| `result.data.status` | ✅ Correct property | Correct |
| `err(createXxxError(...))` | ✅ Works with plain objects | Correct |

### ⚠️ Incorrect or Missing

| Example | Doc Shows | Shipped Reality | Status |
|---------|-----------|------------------|--------|
| `HTTP_STATUS_MAP` | Full map | **NOT SHIPPED** | Proposal |
| `httpStatusForError(error)` | Function | **NOT SHIPPED** | Proposal |
| `pipe()` | Usage shown | **NOT SHIPPED** | Proposal |
| `flatMap()` | Not shown | Exists in `result.ts` | **Missing from doc** |
| `match(result, { ok, err })` | Not shown | Exists in `result.ts` | Missing |

### Key Finding:

**The doc is now honest about proposals** — Section 8 (Migration Path) clearly labels phases as:
- "Phase 1 (done)" — shipped
- "Phase 3 (add `httpStatusForError()` + `HTTP_STATUS_MAP`)" — proposed

This is a big improvement over v2. However, developers consuming this doc might not realize Phase 3-5 features don't exist yet.

---

## 5. The `code`-Based Mapping

### Is HTTP_STATUS_MAP Clear?

**Verdict: Clear, but has issues.**

**What's Good:**
- Centralized map (lines 56-87)
- Covers DB, Auth, Schema, Client, Migration errors
- Each error code maps to single HTTP status
- `httpStatusForError()` function signature is simple: `(error: { code: string }) => number`

**Issues:**

1. **NOT SHIPPED** — This is Phase 3. Currently only `dbErrorToHttpStatus()` exists in `mapping/db-to-http.ts`, and it:
   - Only handles DB errors (NOT_FOUND, UNIQUE_VIOLATION, FK_VIOLATION, NOT_NULL_VIOLATION, CHECK_VIOLATION)
   - Maps FK_VIOLATION → 422 (doc says 409 — **conflict!**)
   - Maps NOT_NULL/CHECK → 422 (doc says 400 — **conflict!**)

2. **Auth vs Client code mismatch:**
   - Auth: `PERMISSION_DENIED` → 403
   - Client: `FORBIDDEN` → 403
   - Both map to 403 but have different codes. Map has both entries (correct), but no explanation.

3. **Missing codes in map?**
   Looking at shipped domain errors:
   - Auth: INVALID_CREDENTIALS ✅, USER_EXISTS ✅, SESSION_EXPIRED ✅, PERMISSION_DENIED ✅, RATE_LIMITED ✅
   - DB: NOT_FOUND ✅, UNIQUE_VIOLATION ✅, FK_VIOLATION ✅, NOT_NULL_VIOLATION ✅, CHECK_VIOLATION ✅
   - Client: VALIDATION_ERROR ✅, NOT_FOUND ✅, CONFLICT ✅, UNAUTHORIZED ✅, FORBIDDEN ✅, RATE_LIMITED ✅
   - Schema: VALIDATION_FAILED (not in client map, only VALIDATION_ERROR)
   
   **Schema's VALIDATION_FAILED is missing from HTTP_STATUS_MAP!** It should map to 400 but isn't listed.

---

## 6. `pipe()` API

### Is the type signature shown?

**Verdict: No — this is a problem for LLM-friendliness.**

The doc shows usage (lines 154-170):
```typescript
return pipe(
  () => ctx.db.orders.get(orderId),
  (order) => { /* transform */ },
  (order) => cancelOrder(order, ctx),
  (cancelled) => processRefundPayment(cancelled.paymentId, ctx),
);
```

But it does NOT show the full type signature. The doc says (line 93):
```typescript
export async function pipe<T, E>(
  ...steps: Array<(input: any) => Result<any, any> | Promise<Result<any, any>>>
): Promise<Result<T, E>>
```

**Problems:**
1. **Not shipped** — This is Phase 4. Doesn't exist in `@vertz/errors` yet.
2. **Type signature incomplete** — Uses `any` for input types, losing type safety. A proper implementation would need:
   - Generic types for each step's input/output
   - Error type accumulation
   - Proper type narrowing

3. **Shipped alternative exists** — `flatMap()` in `result.ts` provides chaining but requires different syntax. Doc doesn't mention it.

**For implementation, an LLM would need to either:**
- Implement `pipe()` from scratch (complex generic types)
- Use `flatMap()` chains (available now, but undocumented in this context)

---

## 7. Two Result Types — Deprecation Path

### Is the deprecation clear?

**Verdict: Clearer than v2, but could be better.**

**What v3 Gets Right:**
- Section 1 (Decision 1) explicitly says "@vertz/core Result stays temporarily for backward compatibility but is deprecated"
- Migration Phase 8: "Deprecate @vertz/core Result"
- Section 9 (Decision Summary) table includes: "@vertz/core Result? → Deprecated. Backward compat maintained, removed later."

**What's Still Unclear:**
1. **Timeline** — No estimate for when Phase 8 happens. "Later" is vague.
2. **Migration guidance** — If I have existing code using `@vertz/core` Result, what do I do? The doc says "use response API directly" but doesn't show examples.
3. **Why two exist** — The history isn't explained. Junior dev might wonder "why were there duplicates?"

**Current state (from shipped code):**
- `@vertz/errors/result.ts` — `{ ok: true, data }` / `{ ok: false, error }`
- `@vertz/core` — `{ ok: true, data }` / `{ ok: false, status, body }`

**Recommendation:** Add migration example:
```typescript
// Before (@vertz/core)
return err(404, { code: 'NOT_FOUND', message: 'User not found' });

// After (@vertz/errors) — return Result, let framework map
return err(createNotFoundError('users', { id }));
```

---

## Summary of Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | PERMISSION_DENIED vs FORBIDDEN mismatch | Medium | Not resolved |
| 2 | flatMap not mentioned (shipped, useful) | Medium | Not fixed |
| 3 | pipe() not shipped, incomplete signature | Medium | New issue |
| 4 | HTTP_STATUS_MAP has conflicts with shipped dbErrorToHttpStatus | High | Not fixed |
| 5 | Schema VALIDATION_FAILED missing from HTTP_STATUS_MAP | Medium | New issue |
| 6 | Two-Result migration path lacks examples | Medium | Partially fixed |

---

## Recommendations

### Must Fix

1. **Add missing VALIDATION_FAILED to HTTP_STATUS_MAP:**
   ```typescript
   'VALIDATION_FAILED': 400,
   ```

2. **Fix FK_VIOLATION / NOT_NULL_VIOLATION mapping conflicts:**
   - Doc says FK_VIOLATION → 409, shipped maps to 422
   - Doc says NOT_NULL_VIOLATION → 400, shipped maps to 422
   - Pick one and update shipped code or doc

3. **Mention flatMap as alternative to pipe:**
   Add a note: "The shipped `flatMap()` function provides chaining. `pipe()` is sugar for longer chains."

### Should Fix

4. **Add Two-Result migration example** — Show before/after for migrating from `@vertz/core` Result to `@vertz/errors` Result

5. **Clarify PERMISSION_DENIED vs FORBIDDEN:**
   - Either standardize on one, OR
   - Document that they're synonyms mapped to same HTTP status

6. **Add pipe() type signature or note it's experimental:**
   Either show full generic signature or note "Phase 4 — type signature TBD"

---

## Final Verdict

**v3 is a significant improvement over v2.** The critical `err()` pattern is fixed, the doc is honest about what's shipped vs proposed, and the structure is clearer. However, the complexity has grown (~400 lines), and some inconsistencies remain.

**Key Risks:**
- Doc proposes `pipe()` and `httpStatusForError()` that don't exist yet
- Auth/Client error code inconsistency not resolved
- Some HTTP mappings conflict with shipped `dbErrorToHttpStatus()`

**For a junior dev:** Can follow with guidance, but would need help understanding what's available today vs Phase 3-5.

**For an LLM:** Can write mostly correct code, but will need to verify APIs exist or implement missing ones (`pipe()`, `HTTP_STATUS_MAP`).

**Action required:** Resolve the mapping conflicts (FK_VIOLATION, NOT_NULL_VIOLATION, VALIDATION_FAILED) and clarify the PERMISSION_DENIED/FORBIDDEN situation before Phase 3 implementation.
