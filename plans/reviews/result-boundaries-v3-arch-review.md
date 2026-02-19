# Architecture Review: Result Boundaries Design Doc (v3)

**Reviewer:** Architecture Subagent  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md` (v3)  
**Status:** Conditional approval — several issues need resolution before implementation

---

## Executive Summary

The v3 design doc represents a **significant course correction** from v2, directly addressing most of the critical issues flagged in the v2 review:

- ✅ **Interfaces stay as interfaces** — explicitly confirmed, no class migration
- ✅ **No VertzException merge** — clearly stated as separate concerns
- ✅ **`pipe()` ships from day one** — addresses composition pain

However, several **new and residual issues** remain:
- `httpStatusForError()` doesn't exist yet (only partial `dbErrorToHttpStatus`)
- HTTP status mapping in doc **conflicts with existing code** (FK_VIOLATION, etc.)
- False positive detection issue **partially addressed but not fully resolved**
- The `@vertz/core` Result detection in app-runner may conflict with new detection

---

## 1. Were v2 Issues Fixed?

### ✅ Fully Resolved

| Issue | Status |
|-------|--------|
| **Interfaces → Classes migration** | ✅ Fixed — v3 explicitly says "Errors Stay as Plain Objects", no migration |
| **VertzException merge** | ✅ Fixed — doc explicitly keeps them separate |
| **`pipe()` helper** | ✅ Fixed — ships from day one (Decision 5) |
| **AppError missing httpStatus** | ✅ Fixed — replaced with `httpStatusForError()` external map |

### ⚠️ Partially Resolved

| Issue | Status |
|-------|--------|
| **False positive detection** | ⚠️ Addressed via boolean check on `result.ok`, but still has edge cases (see Section 3) |
| **Two Result types coexistence** | ⚠️ Detection order defined, but potential conflict exists (see Section 7) |

---

## 2. `httpStatusForError()` Implementation — CRITICAL GAP

### The Problem: Function Doesn't Exist Yet

The v3 doc proposes `httpStatusForError()` in Decision 3:

```typescript
// Doc shows this as existing
export function httpStatusForError(error: { readonly code: string }): number {
  return HTTP_STATUS_MAP[error.code] ?? 500;
}
```

**But this function doesn't exist in the shipped code.** The `@vertz/errors` package only has:
- `dbErrorToHttpStatus()` — handles **only DB errors** (not auth, schema, client, migration)

### HTTP_STATUS_MAP Coverage Analysis

The doc proposes mapping:

| Code | Doc Mapping | Existing `dbErrorToHttpStatus` | Match? |
|------|-------------|--------------------------------|--------|
| NOT_FOUND | 404 | 404 | ✅ |
| UNIQUE_VIOLATION | 409 | 409 | ✅ |
| FK_VIOLATION | 409 | **422** | ❌ **CONFLICT** |
| NOT_NULL_VIOLATION | 400 | **422** | ❌ **CONFLICT** |
| CHECK_VIOLATION | 400 | **422** | ❌ **CONFLICT** |
| INVALID_CREDENTIALS | 401 | N/A | New |
| SESSION_EXPIRED | 401 | N/A | New |
| PERMISSION_DENIED | 403 | N/A | New |
| USER_EXISTS | 409 | N/A | New |
| RATE_LIMITED | 429 | N/A | New |
| VALIDATION_FAILED | 400 | N/A | New |
| VALIDATION_ERROR | 400 | N/A | New |
| UNAUTHORIZED | 401 | N/A | New |
| FORBIDDEN | 403 | N/A | New |
| CONFLICT | 409 | N/A | New |
| MIGRATION_QUERY_ERROR | 500 | N/A | New |
| MIGRATION_CHECKSUM_MISMATCH | 500 | N/A | New |
| MIGRATION_HISTORY_NOT_FOUND | 500 | N/A | New |

### Issues

1. **FK_VIOLATION, NOT_NULL_VIOLATION, CHECK_VIOLATION** map to 422 in existing code but 409/400 in doc
2. **Missing codes** — auth, schema, client, migration error codes need to be added
3. **The function needs to be implemented** — not just designed

### Required Action

- Implement `httpStatusForError()` with full coverage
- Resolve FK_VIOLATION status conflict (422 vs 409)
- Decide on NOT_NULL_VIOLATION / CHECK_VIOLATION (400 vs 422)

---

## 3. Server Boundary Detection — False Positive Risk

### The v3 Detection Logic

```typescript
// Doc Step 4 (pseudocode)
if (result && typeof result === 'object' && 'ok' in result) {
  if (result.ok === true) return jsonResponse(result.data, 200);
  if (result.ok === false) {
    const error = result.error;
    const status = error && typeof error.code === 'string'
      ? httpStatusForError(error)
      : 500;
    return jsonResponse(error, status);
  }
}
```

### Improvements Over v2

- ✅ Checks `result.ok === true` and `result.ok === false` explicitly
- ✅ Verifies `error.code` is a string before calling `httpStatusForError()`

### Remaining Risk

**The detection still matches ANY object with `{ ok: boolean }`:**

```typescript
// Handler accidentally returns plain object (not Result)
return { ok: true, data: { name: 'Alice' } };  // Will be detected as @vertz/errors Result!

// Legitimate API response that happens to have ok/data
return { ok: true, data: { status: 'completed', ok: true } };  // Nested ok!
```

### v2 Recommended: Symbol Brand

v2 recommended adding a Symbol brand to `@vertz/errors` Result, like `@vertz/core` has:

```typescript
// @vertz/core — uses Symbol brand
const RESULT_BRAND: unique symbol = Symbol.for('vertz.result');
interface Ok<T> { readonly ok: true; readonly data: T; readonly [RESULT_BRAND]: true; }
```

### v3 Decision: No Brand

v3 explicitly chose **not** to add a brand, accepting the false positive risk:

> "The server boundary maps error `code` → HTTP status via a centralized lookup"

### Assessment

The risk is **acceptable** because:
1. The boolean check (`result.ok === true`) is stricter than v2's simple `'ok' in result`
2. Real Result objects have `{ ok: true/false, data/error }` — plain objects are unlikely to match
3. The `error.code` check adds another guard

**But it's not ideal.** The false positive case is realistic — developers may return `{ ok, data }` objects without thinking.

---

## 4. `pipe()` Type Safety — RESOLVED

### The Doc's Signature

```typescript
export async function pipe<T, E>(
  ...steps: Array<(input: any) => Result<any, any> | Promise<Result<any, any>>>
): Promise<Result<T, E>>
```

### Analysis

This signature is intentionally loose for usability. TypeScript's type inference works at the call site:

```typescript
// TypeScript infers correctly
const result = pipe(
  () => ctx.db.orders.get(orderId),        // Result<Order, NotFoundError>
  (order) => validateOrder(order),          // Result<Order, ValidationError>
  (order) => processOrder(order),           // Result<void, PaymentError>
);
// Result<void, NotFoundError | ValidationError | PaymentError>
```

### Error Type Accumulation

The doc correctly shows:

```typescript
Result<Refund, DBNotFoundError | ForbiddenError | PaymentError>
```

This is **correct TypeScript behavior** — error unions accumulate through composition.

### Assessment

**The vague signature is intentional and works in practice.** Ship as-is.

---

## 5. DB CRUD Migration — Acceptable

### The Proposal

```typescript
// New: returns Result
const result = await db.users.find(id);         // Result<T, ReadError>
const result = await db.users.create(data);      // Result<T, WriteError>

// Existing: keep as convenience
const user = await db.users.getOrThrow(id);      // T (throws)
const user = await db.users.get(id);             // T | null
```

### Analysis

- ✅ `find()` doesn't conflict with existing methods (`get`, `getOrThrow`)
- ✅ Follows `parse()` / `assert()` pattern from schema layer
- ✅ Additive, non-breaking

### Concern: Method Explosion

| Existing | New (proposed) | Total |
|----------|----------------|-------|
| `get(id)` | `find(id)` | 2 |
| `getOrThrow(id)` | — | 1 |
| `create(data)` | `create(data)` returns T | 1 |
| `update(id, data)` | `update(id, data)` returns T | 1 |
| `delete(id)` | `delete(id)` returns void | 1 |

Adding Result-returning variants doubles the method count. Consider:
- `find()` / `findOrThrow()` — for reads
- `createReturning()` or `save()` for writes

### Recommendation

**Acceptable as-is**, but document that this pattern continues for all CRUD operations.

---

## 6. Backward Compatibility — Acceptable

### The Scenario

```typescript
// Existing handler uses @vertz/core Result
import { ok, err } from '@vertz/core';

handler: async (ctx) => {
  return ok({ id: 1 });
}
```

### What Happens

The app-runner checks in this order (per doc):

```typescript
// 1. @vertz/core Result (Symbol brand)
if (isResult(result)) { ... }

// 2. @vertz/errors Result (no brand)
if (result && typeof result === 'object' && 'ok' in result) { ... }
```

### Assessment

**Backward compatibility maintained** because:
1. `@vertz/core` Result has Symbol brand — detected first with `isResult()`
2. The new detection runs second
3. Existing handlers using `@vertz/core` Result continue to work

---

## 7. `@vertz/core` App-Runner Changes — CONCERN

### The Detection Order Problem

The doc shows this order:

```typescript
// 1. @vertz/core Result? (deprecated path, backward compat)
if (isResult(result)) { ... }

// 2. @vertz/errors Result? (new primary path)
if (result && typeof result === 'object' && 'ok' in result) { ... }
```

### The Conflict

The `@vertz/errors` detection is **very broad**:
```typescript
if (result && typeof result === 'object' && 'ok' in result) { ... }
```

It will match `@vertz/core` Result too! The `@vertz/core` Result has:
- `ok: true/false`
- `data` or `status`/`body`

So if the new detection runs **after** `@vertz/core`, it will also match `@vertz/core` Result.

### Current App-Runner Code

```typescript
// Current code — only checks @vertz/core Result via isResult()
if (isResult(result)) {
  if (isOk(result)) { ... }
  // uses result.status and result.body
}
```

The new detection needs to be inserted **before** the plain value fallback, **after** `@vertz/core` Result detection.

### Required Change

```typescript
// In app-runner.ts:
const result = await entry.handler(ctx);

// 1. Already a Response? Pass through.
if (result instanceof Response) return result;

// 2. @vertz/core Result? (backward compat) — MUST COME FIRST
if (isResult(result)) { /* handle with result.status, result.body */ }

// 3. @vertz/errors Result? (new)
if (result && typeof result === 'object' && 'ok' in result && typeof result.ok === 'boolean') {
  if (result.ok === true) { /* handle with result.data */ }
  if (result.ok === false) { /* handle with result.error, httpStatusForError */ }
}

// 4. Plain value
return jsonResponse(result, 200);
```

### Assessment

**The code change is minimal** (5-10 lines), but the **detection order is critical**. Must verify in implementation.

---

## 8. Summary of Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `httpStatusForError()` doesn't exist | **Critical** | Needs implementation |
| 2 | HTTP status map conflicts with existing code | **High** | FK_VIOLATION, NOT_NULL_VIOLATION, CHECK_VIOLATION |
| 3 | False positive detection | **Medium** | Acceptable risk with boolean check |
| 4 | `pipe()` type safety | ✅ | Works as intended |
| 5 | DB CRUD naming | ✅ | Acceptable |
| 6 | Backward compatibility | ✅ | Maintained |
| 7 | App-runner detection order | **High** | Must verify implementation |

---

## 9. Recommendations

### Before Implementation

1. **Implement `httpStatusForError()`** — not just design it
   - Add to `@vertz/errors/src/mapping/`
   - Resolve FK_VIOLATION (409 vs 422), NOT_NULL_VIOLATION, CHECK_VIOLATION conflicts
   - Add auth, schema, client, migration error mappings

2. **Test detection order** — verify `@vertz/core` Result is caught first

3. **Consider adding light brand to `@vertz/errors` Result** — even a weak brand (not Symbol.for, just a unique string) would eliminate false positive risk

4. **Document the HTTP status choices** — why 409 for FK_VIOLATION instead of 422?

### Implementation Order

1. Phase 3a: Implement `httpStatusForError()` with full coverage
2. Phase 3b: Add detection in app-runner (verify order!)
3. Phase 3c: Add `pipe()` helper
4. Phase 5: DB CRUD variants

---

## 10. Decision Summary

| Question | Answer |
|---|---|
| Were v2 issues fixed? | Mostly yes — interfaces stay, no merge, pipe ships |
| `httpStatusForError()` implemented? | ❌ No — needs to be built |
| HTTP status map correct? | ⚠️ Conflicts with existing code |
| False positive risk resolved? | ⚠️ Acceptable with boolean check |
| `pipe()` type-safe? | ✅ Yes, works in practice |
| DB CRUD naming? | ✅ Acceptable |
| Backward compat maintained? | ✅ Yes |
| App-runner changes minimal? | ✅ ~5-10 lines, but order critical |

**Status:** Conditional approval — resolve items 1, 2, and 7 before implementation

---

## Appendix: Error Code Reference

### All Error Codes in Shipped `@vertz/errors`

| Domain | Code | Exists in Doc Map? |
|--------|------|-------------------|
| DB | NOT_FOUND | ✅ |
| DB | UNIQUE_VIOLATION | ✅ |
| DB | FK_VIOLATION | ✅ (but 409 vs 422) |
| DB | NOT_NULL_VIOLATION | ✅ (but 400 vs 422) |
| DB | CHECK_VIOLATION | ✅ (but 400 vs 422) |
| Auth | INVALID_CREDENTIALS | ✅ |
| Auth | USER_EXISTS | ✅ |
| Auth | SESSION_EXPIRED | ✅ |
| Auth | PERMISSION_DENIED | ✅ |
| Auth | RATE_LIMITED | ✅ |
| Schema | VALIDATION_FAILED | ✅ |
| Client | VALIDATION_ERROR | ✅ |
| Client | NOT_FOUND | ✅ |
| Client | CONFLICT | ✅ |
| Client | UNAUTHORIZED | ✅ |
| Client | FORBIDDEN | ✅ |
| Client | RATE_LIMITED | ✅ |
| Migration | MIGRATION_QUERY_ERROR | ✅ |
| Migration | MIGRATION_CHECKSUM_MISMATCH | ✅ |
| Migration | MIGRATION_HISTORY_NOT_FOUND | ✅ |

---

*End of Review*
