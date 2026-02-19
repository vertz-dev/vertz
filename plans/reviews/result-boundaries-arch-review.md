# Architecture Review: Result Boundaries Design Doc

**Reviewer:** Architecture Subagent  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md`  
**Status:** Needs revision — several critical mismatches with shipped code

---

## Executive Summary

The design doc describes a coherent vision, but **several critical details don't match the actual shipped code** in `@vertz/errors`, `@vertz/db`, and `@vertz/core`. This review identifies concrete problems that must be resolved before implementation.

---

## 1. Type Correctness — CRITICAL MISMATCHES FOUND

### 1.1 Result Field Names: `.value` vs `.data`

**Doc says:** Uses `.value` for success
```typescript
// Doc example
result.value  // accessing success value
```

**Actual code (`@vertz/errors/src/result.ts`):**
```typescript
export interface Ok<T> {
  readonly ok: true;
  readonly data: T;  // <-- NOT .value
}
```

**Impact:** Every code example in the doc is incorrect and won't compile. Must be changed to `.data`.

### 1.2 Three Different Result Types Exist

The codebase has **three separate Result type definitions**:

| Package | Location | Fields |
|---------|----------|--------|
| `@vertz/errors` | `src/result.ts` | `{ ok, data }` / `{ ok, error }` |
| `@vertz/core` | `src/result.ts` | `{ ok, data }` / `{ ok, status, body }` |
| `@vertz/server` | `src/domain/types.ts` | `{ ok, data }` / `{ ok, error }` |

**`@vertz/core` Result is HTTP-aware** — it has `status` and `body` fields on error:
```typescript
// @vertz/core/src/result.ts
export interface Err<E> {
  readonly ok: false;
  readonly status: number;  // HTTP status embedded
  readonly body: E;
}
```

**The doc proposes** using `@vertz/errors` Result at the service layer and having the server auto-map to HTTP. However:

1. The current `@vertz/core` Result **already has HTTP semantics built in**
2. The app-runner (`@vertz/core/src/app/app-runner.ts`) already handles Result auto-mapping
3. The doc doesn't acknowledge this existing implementation

### 1.3 Method Names: Mostly Correct

The doc mentions `.match()` and `.flatMap()` — these **do exist** in `@vertz/errors`:
- ✅ `match()` — exists
- ✅ `flatMap()` — exists  
- ✅ `map()` — exists (not mentioned in doc)
- ✅ `unwrap()` — exists (not mentioned in doc)

### 1.4 AppError Missing `httpStatus`

**Doc claims:**
```typescript
// Doc: "Every AppError subclass carries its own HTTP status code"
result.error.httpStatus
```

**Actual code (`@vertz/errors/src/app-error.ts`):**
```typescript
export class AppError<C extends string = string> extends Error {
  readonly code: C;
  // NO httpStatus property!
  
  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message };
  }
}
```

**Impact:** The auto-mapping logic in Section 5 won't work as described. There's no `httpStatus` to read. Either:
1. Add `httpStatus` to `AppError`, or
2. Create a mapping table from error codes to HTTP status

---

## 2. Integration Feasibility — Partially Hand-Waving

### 2.1 Server Already Has Auto-Mapping

The doc describes implementing auto-mapping:
> "The server boundary uses this to auto-map Result → HTTP Response."

But **this already exists** in `@vertz/core/src/app/app-runner.ts` (lines 196-219):

```typescript
// Handle Result type (errors-as-values pattern)
if (isResult(result)) {
  if (isOk(result)) {
    return createResponseWithCors(result.data, 200, config, request);
  } else {
    // Err result - use error status and body
    const errorStatus = result.status;
    const errorBody = result.body;
    return createResponseWithCors(errorBody, errorStatus, config, request);
  }
}
```

**Problem:** This works with `@vertz/core` Result (which has `status` and `body`), not `@vertz/errors` Result (which has `error`).

### 2.2 What Needs to Change

To use `@vertz/errors` Result:
1. Either refactor `@vertz/core` Result to match `@vertz/errors` interface
2. Or add a conversion layer in the app-runner
3. Or create a new Result type that combines both

**The doc doesn't specify which approach to take.**

### 2.3 Missing: `createServer()` and `domain()` API Details

The doc references `createServer()` and `domain()` but doesn't show how Result integrates with them. Based on current code:
- `createServer()` creates the app (from `@vertz/core`)
- `domain()` is a stub in `@vertz/server` (returns frozen object, no actual logic)

**Implementation path is unclear** — the doc needs concrete API examples.

---

## 3. Edge Cases — Not Addressed

### 3.1 Void Returns

What happens when a service returns `Result<void, E>`?

```typescript
// Does this work?
async function deleteUser(id: string): Promise<Result<void, NotFoundError>> {
  const user = await findUser(id);
  if (!user.ok) return user;
  
  await db.users.delete(user.value.id);  // .value is void!
  return ok(undefined);
}
```

**Current `@vertz/errors`:** `ok()` accepts any `T`, including `void`/`undefined`:
```typescript
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
```

**Doc:** Doesn't mention this case.

### 3.2 Null Results

Same issue — what if the success value is `null`?

```typescript
async function findUser(id: string): Promise<Result<User | null, DbError>> {
  // ... returns null if not found, but that's not an error
}
```

This works with current types but the doc should clarify.

### 3.3 Streaming Responses, File Uploads, Redirects, WebSockets

**Not addressed in doc.** These don't fit the Result model:

- **Streaming:** You can't put a stream in a Result and serialize it to JSON
- **File uploads:** The handler receives a stream, not a Result
- **Redirects:** Need `Response` with 3xx status, not a data Result
- **WebSocket upgrades:** Entirely different pattern

**The doc claims "90% of routes" work with auto-mapping** — but doesn't quantify or acknowledge the 10% that don't.

---

## 4. Composition at Scale — Legitimate Concern

### 4.1 The Repetition is Real

The doc shows 3 steps:
```typescript
const order = await findOrder(orderId, ctx)
if (!order.ok) return order

const cancel = await cancelOrder(order.value, ctx)
if (!cancel.ok) return cancel

const payment = await processRefundPayment(order.value.paymentId, ctx)
if (!payment.ok) return payment
```

**At 8-10 steps**, this becomes painful:
```typescript
const a = await step1(); if (!a.ok) return a;
const b = await step2(a.value); if (!b.ok) return b;
const c = await step3(b.value); if (!c.ok) return c;
const d = await step4(c.value); if (!d.ok) return d;
const e = await step5(d.value); if (!e.ok) return e;
const f = await step6(e.value); if (!f.ok) return f;
const g = await step7(f.value); if (!g.ok) return g;
const h = await step8(g.value); if (!h.ok) return h;
```

### 4.2 The Doc Acknowledges This

The doc says:
> "We may add a `pipe()` or `chain()` helper later if the repetition proves painful in practice."

**Problem:** `flatMap` already exists! But it's awkward to use:
```typescript
// flatMap chains but doesn't short-circuit on error nicely
const result = await flatMap(await step1(), async (a) => 
  flatMap(await step2(a), async (b) => 
    flatMap(await step3(b), async (c) => ok(final(c)))
  )
);
```

**Recommendation:** Ship with explicit propagation (as doc suggests) but **add a `andThen()` or sequence helper** before proving it's painful — the pain is predictable.

### 4.3 Error Union Growth

The doc says "if >5 error types, decompose." This is reasonable but **unenforced**. TypeScript won't stop you from adding a 6th. Consider:
- A compile-time check or lint rule
- Documentation about what "too many" looks like

---

## 5. Backward Compatibility — Breaking Changes Found

### 5.1 `@vertz/db` CRUD Methods Currently THROW

**Doc claims:**
> "Database already returns Result. Shipped in PR #436."

**Actual code (`@vertz/db/src/query/crud.ts`):**
```typescript
// getOrThrow throws NotFoundError
export async function getOrThrow<T>(...): Promise<T> {
  const row = await get<T>(queryFn, table, options);
  if (row === null) {
    throw new NotFoundError(table._name);  // <-- THROWS!
  }
  return row;
}

// update throws NotFoundError
export async function update<T>(...): Promise<T> {
  // ...
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);  // <-- THROWS!
  }
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}

// deleteOne throws NotFoundError
export async function deleteOne<T>(...): Promise<T> {
  // ...
  if (res.rows.length === 0) {
    throw new NotFoundError(table._name);  // <-- THROWS!
  }
  return mapRow<T>(res.rows[0] as Record<string, unknown>);
}
```

**The db package does NOT return Result** — it throws on "not found" and presumably on constraint violations too.

**Impact:** Either:
1. Add new methods that return Result (breaking naming scheme)
2. Change existing methods to return Result (breaking existing callers)

### 5.2 `@vertz/core` Result Already Exists

The current Result type in `@vertz/core` has HTTP semantics:
```typescript
// @vertz/core
err(404, { code: 'NOT_FOUND', message: '...' })
```

The doc proposes moving to `@vertz/errors` Result:
```typescript
// @vertz/errors  
err({ code: 'NOT_FOUND', message: '...' })  // No status!
```

**This is a breaking change** for anyone using `@vertz/core` Result directly.

---

## 6. The Infrastructure Throw Line — Ambiguous

### 6.1 Doc Says:
> "Infrastructure errors throw. They're caught once at the server boundary and mapped to 500."

### 6.2 What's Actually Thrown in Current Code

**From `@vertz/errors/src/infra/index.ts`:**
- `ConnectionError` — thrown
- `PoolExhaustedError` — thrown
- `TimeoutError` — thrown

### 6.3 Gray Areas Not Addressed

The doc doesn't address these ambiguous cases:

| Scenario | Throw or Result? | Doc Answer |
|----------|-----------------|------------|
| Unique constraint violation | ? | Unclear |
| Query timeout (slow but valid query) | ? | Says "throw" but this is ambiguous |
| Deadlock detection | ? | Not mentioned |
| DB goes read-only mode | ? | Not mentioned |
| Auth token expires mid-request | ? | Not mentioned |

**Specific problem:** The doc treats "unique constraint violation" as domain error (Result), but:
1. It's a DB-level error
2. In some systems, this is truly infrastructure (bug in code that should have validated)
3. In other systems, it's expected (user trying to register duplicate email)

**Recommendation:** Define explicit categories in `@vertz/db`:
- `UniqueConstraintError extends AppError` → Result (domain-meaningful)
- `ConnectionError extends Error` → throw (infrastructure)

---

## 7. Summary of Issues

### Critical (Must Fix)
1. **Field name mismatch:** Doc uses `.value`, actual code uses `.data`
2. **Three Result types exist:** Doc proposes one, but core already has another
3. **AppError missing httpStatus:** Auto-mapping logic won't work
4. **DB throws, doesn't return Result:** Doc claims PR #436 shipped this (incorrect)

### Important (Should Fix)
5. **Edge cases undocumented:** void, null, streaming, WebSocket
6. **Server auto-map already exists:** But incompatible with proposed Result
7. **Composition at scale:** Needs helper before shipping (not after pain)

### Nice to Have
8. **Error union limit:** >5 types should trigger lint warning
9. **Infrastructure throw line:** More explicit categorization needed

---

## 8. Recommendations

### Before Implementation

1. **Unify Result types** — Choose one:
   - Use `@vertz/core` Result everywhere (already has HTTP mapping)
   - Use `@vertz/errors` Result and add HTTP mapping layer
   - Create new unified Result

2. **Add httpStatus to AppError** or create error-code-to-status mapping

3. **Clarify DB API** — either:
   - Add new Result-returning methods to `@vertz/db`
   - Or document that existing methods throw (contradicts doc)

4. **Document edge cases** — void, null, streaming, redirects

### Suggested Next Steps

1. **Run a spike** on a single service using the proposed pattern
2. **Write actual code** for `flatMap` composition helper
3. **Test the mapping** between `@vertz/errors` Result and HTTP response

---

## Appendix: Relevant Code References

| File | Key Finding |
|------|-------------|
| `@vertz/errors/src/result.ts` | Actual Result type uses `.data`, not `.value` |
| `@vertz/errors/src/app-error.ts` | No `httpStatus` property |
| `@vertz/core/src/result.ts` | Different Result with HTTP semantics |
| `@vertz/core/src/app/app-runner.ts` | Auto-mapping already exists |
| `@vertz/db/src/query/crud.ts` | Methods throw, don't return Result |
| `@vertz/server/src/domain/types.ts` | Stub Result definition |
| `@vertz/errors/src/domain/db.ts` | Domain error types (NotFoundError, UniqueViolation, etc.) |
| `@vertz/errors/src/domain/auth.ts` | Auth error types |
