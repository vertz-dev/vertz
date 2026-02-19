# DX Review: result-boundaries.md

**Reviewer:** DX Review Subagent  
**Date:** 2026-02-18  
**File:** `/Users/viniciusdacal/openclaw-workspace/vertz/plans/result-boundaries.md`

---

## Summary

The design doc outlines a clear vision for Result vs throwing boundaries, but **there are significant inconsistencies between the doc and what's actually shipped** in `@vertz/errors`. A junior developer or LLM following this doc would write broken code.

---

## 1. Learnability

### Issues Found

**1.1. Confusing distinction between plain domain errors and AppError subclasses**

The doc mentions both:
- "Services return `Result<T, DomainError>`" (Section 3)
- Examples using `AppError` subclasses like `ForbiddenError`, `NotFoundError` (Section 4)

But the shipped code has **two different error patterns**:
1. Plain objects: `{ code: 'NOT_FOUND', message: '...', table?: string }` (e.g., `NotFoundError` from `domain/db.ts`)
2. `AppError` subclasses: class extending `AppError<'FORBIDDEN'>` (from `app-error.ts`)

A junior dev won't understand when to use which. The doc doesn't explain this.

**1.2. AppError is missing `httpStatus` property**

The doc states (Section 5):
> "Every `AppError` subclass carries its own HTTP status code"

And later:
> "returns `Response.json(result.error.toJSON(), { status: result.error.httpStatus })`"

But the **shipped `AppError` class has no `httpStatus` property**:

```typescript
// Shipped in @vertz/errors/src/app-error.ts
export class AppError<C extends string = string> extends Error {
  readonly code: C;
  
  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message };
  }
}
```

**The `httpStatus` property simply doesn't exist.** The doc assumes it's there, but it isn't.

---

## 2. LLM-Friendliness

### Issues Found

**2.1. Wrong property name: `.value` vs `.data`**

The doc uses `.value` in examples (Section 4):

```typescript
if (order.value.status === 'shipped') {
  return err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))
}
```

But the **shipped `Ok<T>` interface uses `.data`**, not `.value`:

```typescript
// Shipped in @vertz/errors/src/result.ts
export interface Ok<T> {
  readonly ok: true;
  readonly data: T;  // NOT .value
}
```

An LLM following the doc would write `order.value.status` and get a TypeScript error.

**2.2. Missing `httpStatus` would break LLM-generated code**

If an LLM tries to implement the Section 5 pattern:
```typescript
return Response.json(result.error.toJSON(), { status: result.error.httpStatus })
```

This won't compile because `httpStatus` doesn't exist on `AppError`.

**2.3. Ambiguous error creation pattern**

The doc shows:
```typescript
return err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))
```

But `err()` expects an error **object**, not an `AppError` instance. You can't do `err(new ForbiddenError(...))` because the `error` field would be an `Error` instance, not a plain object.

The correct pattern would be:
```typescript
// Option 1: Plain object with code
return err({ code: 'FORBIDDEN', message: 'ORDER_ALREADY_SHIPPED' })

// Option 2: Using the domain error factory  
return err(createPermissionDeniedError('ORDER_ALREADY_SHIPPED'))
```

The doc conflates `err()` (Result factory) with throwing `AppError`.

---

## 3. Consistency

### Issues Found

**3.1. Schema package status mismatch**

The doc says (Section 6):
> "@vertz/schema — Already decided: `schema.parse(input)` → `Result<T, SchemaError>`"

But this is listed in "Phase 3 (next)" in Section 8. The package `@vertz/schema` may not even exist yet or doesn't have this API. The doc is ambiguous about what's actually shipped.

**3.2. Database errors use different codes than what client receives**

The doc states (Section 6, `@vertz/client`):
> "Client error vocabulary matches what the server sends: `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`"

But the shipped DB errors are:
- `UNIQUE_VIOLATION` (not `CONFLICT`)
- `FK_VIOLATION` 
- `NOT_NULL_VIOLATION`
- `CHECK_VIOLATION`

These **don't map 1:1** to client codes. The doc doesn't explain the translation layer. The mapping exists in `mapping/db-to-http.ts` but the client receives different codes.

**3.3. auth.ts has PERMISSION_DENIED but client.ts has FORBIDDEN**

Shipped auth errors use `PERMISSION_DENIED`:
```typescript
// domain/auth.ts
interface PermissionDeniedError {
  readonly code: 'PERMISSION_DENIED';
}
```

But client errors use `FORBIDDEN`:
```typescript
// domain/client.ts
interface ForbiddenError {
  readonly code: 'FORBIDDEN';
}
```

The doc mentions `FORBIDDEN` in examples but the auth domain has `PERMISSION_DENIED`. This is a **naming inconsistency** between auth and client layers.

---

## 4. Gaps

### Not Covered

| Gap | Impact |
|-----|--------|
| **Streaming/Server-Sent Events** | How to handle errors in streaming responses? |
| **WebSocket errors** | Not mentioned at all |
| **Batch operations** | How to return Results for bulk operations? Multiple errors? |
| **Middleware errors** | How do middleware errors propagate? |
| **Graceful degradation** | What if one service in a chain is down but others work? |
| **Retry logic** | When to retry vs return Result? |
| **Cancellation** | How to handle request cancellation? |
| **Timeout handling** | TimeoutError throws but when? Who catches it? |

---

## 5. Contradictions

**5.1. Cannot verify — error-taxonomy.md doesn't exist**

The doc states it "Depends on: `plans/error-taxonomy.md` (approved)" but this file does not exist in the workspace. I cannot verify contradictions because the foundation file is missing.

---

## 6. Code Examples

### Compilation Failures

**6.1. `.value` doesn't exist on Ok<T>**

```typescript
// Doc example (won't compile)
order.value.status === 'shipped'

// What actually works
order.data.status === 'shipped'
```

**6.2. `httpStatus` doesn't exist on AppError**

```typescript
// Doc example (won't compile)
{ status: result.error.httpStatus }

// What would work (if implemented)
{ status: 403 } // Hardcoded
```

**6.3. `err()` with AppError instance**

```typescript
// Doc example (wrong - will have weird runtime behavior)
return err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))

// What should be
return err(createPermissionDeniedError('ORDER_ALREADY_SHIPPED'))
// Or
return err({ code: 'FORBIDDEN', message: 'ORDER_ALREADY_SHIPPED' })
```

**6.4. The doc mentions flatMap/chain helpers don't exist yet**

The doc says:
> "We may add a `pipe()` or `chain()` helper later"

But `flatMap` **already exists** in the shipped code! The doc doesn't mention it:

```typescript
// Already shipped in result.ts
export function flatMap<T, E, U, F>(result: Result<T, E>, fn: (data: T) => Result<U, F>): Result<U, E | F>
```

The doc could have used this in examples instead of manual `if (!x.ok) return x` chains.

---

## Recommendations

1. **Add `httpStatus` to `AppError`** or document that it's computed via separate mapping functions
2. **Fix `.value` → `.data`** in all doc examples
3. **Clarify when to use plain objects vs AppError subclasses** — pick one pattern
4. **Reconcile PERMISSION_DENIED (auth) vs FORBIDDEN (client)** — pick one code
5. **Add error-taxonomy.md** — the foundation document is missing
6. **Document the DB→HTTP→Client translation** explicitly
7. **Add flatMap to the composition section** — it already exists
8. **Cover gaps**: streaming, WebSocket, batch operations, middleware

---

## Severity

| Issue | Severity |
|-------|----------|
| `.value` vs `.data` | **Critical** — code won't compile |
| Missing `httpStatus` | **Critical** — code won't compile |
| err() with AppError | **High** — wrong runtime behavior |
| PERMISSION_DENIED vs FORBIDDEN | **Medium** — confusion, potential bugs |
| Missing error-taxonomy.md | **High** — can't verify foundations |
