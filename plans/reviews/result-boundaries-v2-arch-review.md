# Architecture Review: Result Boundaries Design Doc (v2)

**Reviewer:** Architecture Subagent  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md` (v2)  
**Status:** Conditional approval — several critical issues need resolution

---

## Executive Summary

The v2 design doc shows significant progress addressing v1 review findings. Key improvements include:
- Corrected field names (`.data` instead of `.value`)
- Added `httpStatus` to `AppError` proposal
- Acknowledged DB interface→class migration needed
- Clearer migration phases

However, **several critical technical mismatches remain** between the doc and actual shipped code that could cause implementation failures. Most critically: **the domain error types in `@vertz/errors` are interfaces, not classes**, which fundamentally breaks the auto-mapping design.

---

## 1. Were Previous Issues Fixed?

### ✅ Resolved

| Issue | Status |
|-------|--------|
| Field name `.value` vs `.data` | ✅ Fixed — doc now uses `.data` |
| Method names (`match`, `flatMap`) | ✅ Correct |
| DB CRUD throwing (acknowledged) | ✅ Doc proposes adding Result variants |

### ⚠️ Partially Resolved

| Issue | Status |
|-------|--------|
| Three Result types | ⚠️ Doc proposes using `@vertz/errors` Result, keeping `@vertz/core` Result as escape hatch — reasonable |
| AppError missing `httpStatus` | ⚠️ Proposed to add, but implementation details problematic (see Section 2) |
| Server auto-mapping | ⚠️ Doc proposes adding detection for `@vertz/errors` Result, but detection logic has issues (see Section 4) |

### ❌ Remaining

| Issue | Status |
|-------|--------|
| DB interface errors → classes | ❌ Not fixed — still interfaces, needs migration |
| Void/null returns | ❌ Not documented |
| Edge cases (streaming, WebSockets) | ❌ Not addressed |

---

## 2. `AppError` Getting `httpStatus` — CRITICAL ISSUE

### The Problem: Interface vs Class Mismatch

The doc proposes adding `httpStatus` to `AppError`:

```typescript
// Doc Step 2 - proposed AppError
export class AppError<C extends string = string> extends Error {
  readonly code: C;
  readonly httpStatus: number;
  constructor(code: C, message: string, httpStatus: number = 500) { ... }
}
```

And shows domain errors as **classes extending AppError**:

```typescript
// Doc Step 2 - proposed
class NotFoundError extends AppError<'NOT_FOUND'> {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404);
  }
}
```

**But the actual code has interfaces:**

```typescript
// @vertz/errors/src/domain/db.ts - ACTUAL CODE
export interface NotFoundError {
  readonly code: 'NOT_FOUND';
  readonly message: string;
  readonly table: string;
  readonly key?: Record<string, unknown>;
}
```

This pattern repeats across all domain error files:
- `domain/db.ts`: `NotFoundError`, `UniqueViolation`, `FKViolation`, etc. — **all interfaces**
- `domain/auth.ts`: `InvalidCredentialsError`, `UserExistsError`, etc. — **all interfaces**
- `domain/schema.ts`: `ValidationError` — **interface**
- `domain/client.ts`: `ValidationError`, `NotFoundError`, `ConflictError`, etc. — **all interfaces**

### Impact

The doc's auto-mapping logic (Step 4) relies on:

```typescript
// Doc Step 4
if (error instanceof AppError) {
  return createResponseWithCors(error.toJSON(), error.httpStatus, config, request);
}
```

**This won't work because:**
1. Domain errors are interfaces, not classes
2. They can't be used with `instanceof`
3. They don't have `httpStatus` property
4. The `toJSON()` method doesn't exist on interfaces

### Required Fix

The doc must explicitly address the **interface → class migration**. This is mentioned briefly in Section 8 ("Migrate from interfaces to classes extending `AppError`"), but:

1. **No concrete migration plan** — How do we convert 15+ interfaces to classes?
2. **Breaking change** — Existing type guards like `isNotFoundError(error)` need updating
3. **Dual existence** — During migration, both interfaces and classes would exist

### Recommendation

The migration should:
1. Create new class versions of each error (e.g., `class NotFoundError extends AppError`)
2. Keep interface versions as type aliases (e.g., `type NotFoundError = NotFoundErrorClass`)
3. Update factory functions to return class instances
4. Deprecate `isXxxError` functions in favor of `instanceof`

---

## 3. `VertzException extends AppError` — Non-Breaking?

### Current Constructor

```typescript
// @vertz/core/src/exceptions/vertz-exception.ts - ACTUAL
export class VertzException extends Error {
  constructor(
    message: string,
    statusCode = 500,
    code?: string,
    details?: unknown  // <-- 4th parameter
  ) { ... }
}
```

### Proposed Constructor

```typescript
// Doc Step 3a
export class VertzException extends AppError {
  constructor(message: string, statusCode = 500, code?: string) {
    super(code ?? 'INTERNAL_ERROR', message, statusCode);
  }
}
```

### Issues

1. **Missing `details` parameter** — The current constructor accepts a 4th `details` parameter. Removing it is a breaking change.

2. **Checking VertzException usages:**

```typescript
// @vertz/core/src/exceptions/http-exceptions.ts
export class BadRequestException extends VertzException {
  constructor(message: string, details?: unknown) {
    super(message, 400, undefined, details);  // passes details
  }
}
```

All HTTP exception subclasses pass `details` through. If we remove the parameter, these break.

### Assessment

**Not non-breaking.** The constructor signature change breaks:
- All HTTP exception subclasses that pass `details`
- Any external code using `new VertzException(msg, status, code, details)`

### Recommendation

Keep the `details` parameter in `VertzException`:

```typescript
export class VertzException extends AppError {
  constructor(
    message: string,
    statusCode = 500,
    code?: string,
    details?: unknown
  ) {
    super(code ?? 'INTERNAL_ERROR', message, statusCode);
    this.details = details;
  }
  readonly details?: unknown;
}
```

---

## 4. Server Boundary Detection — False Positive Risk

### Proposed Detection Logic

```typescript
// Doc Step 4
if (result && typeof result === 'object' && 'ok' in result && typeof result.ok === 'boolean') {
  // Handle as @vertz/errors Result
}
```

### The Problem

This detects **any object** with `{ ok: true/false }`, including:

1. **Plain objects returned from handlers** (not using Result constructors):
   ```typescript
   // Handler accidentally returns:
   return { ok: true, data: user };  // Not a Result!
   ```

2. **Data that happens to have these fields**:
   ```typescript
   // Legitimate response that looks like Result
   return { ok: true, data: { status: 'completed' } };
   ```

### Current Protection: Symbol Brand

The `@vertz/core` Result uses a Symbol brand:

```typescript
// @vertz/core/src/result.ts
const RESULT_BRAND: unique symbol = Symbol.for('vertz.result');

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
  readonly [RESULT_BRAND]: true;
}

export function isResult(value: unknown): boolean {
  // Checks Symbol brand - won't match plain objects
}
```

### Analysis

The doc proposes removing Symbol brand detection and using plain object detection instead. This is a **regression** in type safety.

### Recommendation

**Keep both detection mechanisms:**

```typescript
// Check for branded @vertz/core Result first
if (isResult(result)) { ... }

// Then check for @vertz/errors Result (unbranded)
// BUT also verify it's actually from @vertz/errors
if (isVertzErrorsResult(result)) { ... }
```

Where `isVertzErrorsResult` could check for the presence of specific error types or a different brand.

---

## 5. DB Error Types: Interface → Class Migration

### Scope

From `@vertz/errors/src/domain/`:

| File | Interfaces | Total |
|------|-----------|-------|
| `db.ts` | `NotFoundError`, `UniqueViolation`, `FKViolation`, `NotNullViolation`, `CheckViolation` | 5 |
| `auth.ts` | `InvalidCredentialsError`, `UserExistsError`, `SessionExpiredError`, `PermissionDeniedError`, `RateLimitedError` | 5 |
| `schema.ts` | `ValidationError` | 1 |
| `client.ts` | `ValidationError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `RateLimitedError` | 6 |

**Total: 17 interfaces** need migration to classes.

### Breaking Changes

1. **Type guards break:**
   ```typescript
   // Current
   if (isNotFoundError(error)) { ... }
   
   // After migration - still works if we keep type guards checking .code
   ```

2. **Factory functions need updating:**
   ```typescript
   // Current
   export function createNotFoundError(table: string, key?: ...): NotFoundError {
     return { code: 'NOT_FOUND', message: ..., table, key };
   }
   
   // After - needs to return class instance
   export function createNotFoundError(...): NotFoundError {
     return new NotFoundErrorClass(...);
   }
   ```

3. **Result error types:**
   ```typescript
   // Current
   type DBError = NotFoundError | UniqueViolation | ...;  // Union of interfaces
   
   // After - union of classes (still works)
   ```

### Effort Estimate

- **17 class definitions** to create
- **17 factory function updates**
- **Type guard updates** (or keep as-is if they check `.code` field)
- **Test updates** for any tests using these types

**This is a medium-sized migration** — not trivial, but manageable. The doc should include a specific task for this.

---

## 6. Composition at Scale — Acceptable?

### The Pattern

```typescript
const a = await step1(); if (!a.ok) return a;
const b = await step2(a.data); if (!b.ok) return b;
const c = await step3(b.data); if (!c.ok) return c;
// ... repeated 8-10 times
```

### Doc's Position

> "Ship explicit first. Add `pipe()` if devs ask."

### Assessment

**This is acceptable but suboptimal.**

Arguments for shipping explicit:
- ✅ Explicit error handling is visible
- ✅ Greppable
- ✅ Type-safe
- ✅ Works today with existing infrastructure

Arguments for shipping `pipe()`:
- The pain is **predictable**, not surprising
- Adding it **before** shipping is better than after
- `flatMap` exists but is awkward

### Recommendation

**Add `pipe()` before Phase 3 shipping.** The pattern is well-understood:

```typescript
// Proposed pipe()
export async function pipe<T, E>(
  initial: Promise<Result<T, E>>,
  ...steps: [(data: T) => Promise<Result<any, any>>][]
): Promise<Result<any, E>>
```

Even a simple helper reduces the 8-10 line repetition to 3-4 lines.

---

## 7. Two Result Types Coexistence — Risk Assessment

### The Two Result Types

| Package | Fields | Brand |
|---------|--------|-------|
| `@vertz/errors` | `{ ok, data }` / `{ ok, error }` | ❌ None |
| `@vertz/core` | `{ ok, data }` / `{ ok, status, body }` | ✅ Symbol |

### Risk: Wrong Result Returned

```typescript
// Handler imports from wrong package
import { ok, err } from '@vertz/errors';  // Wrong import!

handler: async (ctx) => {
  // Returns @vertz/errors Result
  return ok({ id: 1 });
}
```

### What Happens

The app-runner currently detects `@vertz/core` Result via Symbol brand:

```typescript
// @vertz/core/src/app/app-runner.ts
if (isResult(result)) {  // Checks Symbol brand
  if (isOk(result)) { ... }
}
```

If a handler returns `@vertz/errors` Result, **it won't be detected** and will fall through to plain value handling (or fail).

### Doc's Proposal

Step 4 adds detection for `@vertz/errors` Result:

```typescript
// Check for @vertz/errors Result (plain discriminated union)
if (result && typeof result === 'object' && 'ok' in result && typeof result.ok === 'boolean') {
  // This will match BOTH Result types!
}
```

**Problem:** Both Result types have `{ ok: true/false }`. This detection is ambiguous.

### Recommendation

The detection should be:
1. **First:** Check for `@vertz/core` Result (Symbol brand) — has explicit HTTP status
2. **Second:** Check for `@vertz/errors` Result, but distinguish from plain objects

One approach: Add a separate brand to `@vertz/errors` Result, or check for the `error` property presence:

```typescript
// Distinguish by error shape
if ('status' in result && 'body' in result) {
  // @vertz/core Result
} else if ('error' in result) {
  // @vertz/errors Result (or plain object with error field)
}
```

The second case is still ambiguous. Consider adding a light brand to `@vertz/errors` Result.

---

## 8. Summary of Critical Issues

| # | Issue | Severity | Fix Required |
|---|-------|----------|--------------|
| 1 | Domain errors are interfaces, not classes | **Critical** | Explicit migration plan for 17 interfaces → classes |
| 2 | Auto-mapping assumes `instanceof AppError` | **Critical** | Requires classes, won't work with interfaces |
| 3 | `VertzException` constructor signature change | **Medium** | Keep `details` parameter for backward compat |
| 4 | Plain object detection for Result has false positives | **Medium** | Use Symbol brand for `@vertz/errors` Result too |
| 5 | Two Result types with overlapping shapes | **Medium** | Clear detection order and ambiguity handling |
| 6 | Composition boilerplate | **Low** | Add `pipe()` helper before shipping |

---

## 9. Recommendations

### Before Phase 3 Implementation

1. **Add explicit migration task for domain error interfaces → classes**
   - List all 17 interfaces
   - Define class hierarchy
   - Update factory functions
   - Keep type aliases for backward compat

2. **Clarify auto-mapping implementation**
   - The `instanceof AppError` check won't work with interfaces
   - Either: Use `.code` field discrimination instead of `instanceof`
   - Or: Complete the interface→class migration first

3. **Preserve `VertzException` constructor signature**
   - Keep the `details` parameter

4. **Add Symbol brand to `@vertz/errors` Result**
   - Prevents false positive detection
   - Matches `@vertz/core` pattern

5. **Add `pipe()` helper before shipping**
   - Even a basic version reduces 8-10 step composition pain

### Suggested Implementation Order

1. Phase 3a: Add `httpStatus` to `AppError` (after interface→class migration)
2. Phase 3b: `VertzException extends AppError` (with `details` preserved)
3. Phase 3c: Server boundary detection (with proper Symbol brands)
4. Phase 4: Schema changes (separate from Result work)
5. Phase 5: DB CRUD Result variants

---

## Appendix: Code References

| File | Finding |
|------|---------|
| `@vertz/errors/src/app-error.ts` | No `httpStatus` property (Line 13-24) |
| `@vertz/errors/src/domain/db.ts` | All errors are interfaces (Lines 14-130) |
| `@vertz/errors/src/domain/auth.ts` | All errors are interfaces |
| `@vertz/errors/src/domain/schema.ts` | `ValidationError` is interface |
| `@vertz/errors/src/domain/client.ts` | All errors are interfaces |
| `@vertz/core/src/result.ts` | Uses Symbol brand (Line 120) |
| `@vertz/core/src/exceptions/vertz-exception.ts` | Has `details` parameter (Line 6) |
| `@vertz/core/src/app/app-runner.ts` | Uses `isResult()` Symbol check (Line 196) |
| `@vertz/db/src/query/crud.ts` | Methods throw `NotFoundError` (Lines 68, 149, 189) |
| `@vertz/db/src/errors/db-error.ts` | Has `NotFoundError` class (Line 127) |
