# Result Boundaries — Where Result Stops and Throwing Begins

**Author:** Mika (VP Engineering)  
**Date:** 2026-02-18  
**Status:** Proposal (v3 — revised after code audit + two review rounds)  
**Depends on:** `@vertz/errors` (shipped, PR #420)  
**Resolves:** #398 (schema Result), #399 (server Result)

---

## 0. Current State

### Result Types (four exist, one should win)

| Package | Err Shape | Purpose |
|---|---|---|
| `@vertz/errors` | `{ ok: false, error: E }` | Business logic, migrations |
| `@vertz/core` | `{ ok: false, status: number, body: E }` | Route handlers (HTTP-aware) |
| `@vertz/server` (domain) | `{ ok: false, error: E }` | Inline duplicate of errors |
| `@vertz/server` (auth) | `{ ok: false, error: AuthError }` | Inline duplicate of errors |

### Error Types: Plain Objects, Not Classes

All domain errors in `@vertz/errors` are **interfaces with factory functions**, not classes:

```typescript
// This is how errors are created today
const error = createNotFoundError('users', { id: '123' });
// → { code: 'NOT_FOUND', message: 'Record not found in users: {"id":"123"}', table: 'users', key: { id: '123' } }
```

Every error has a `code` string discriminant. Type guards use `code` for narrowing:
```typescript
if (isNotFoundError(error)) { /* TypeScript narrows */ }
```

Errors are **plain serializable objects** — no prototypes, no `instanceof`, no methods. This is intentional: they serialize to JSON naturally and work across process boundaries.

### Exception Hierarchy (separate from domain errors)

`@vertz/core` has `VertzException` (extends `Error`) with HTTP exception subclasses:
- `BadRequestException` (400), `UnauthorizedException` (401), `ForbiddenException` (403), `NotFoundException` (404), `ConflictException` (409), `ValidationException` (422), `InternalServerErrorException` (500), `ServiceUnavailableException` (503)

These are used in route handlers for throw-based error handling today.

### `AppError` Class

`@vertz/errors` has `AppError<C>` — a class with `code` and `toJSON()`. It exists but is **not used by the domain error interfaces**. It was designed for app developers to subclass for custom business errors. The framework's own errors use plain interfaces.

---

## 1. The Rule

> **Expected failures return `@vertz/errors` Result. Unexpected failures throw.**

- **Expected:** Validation, not-found, conflicts, business rule violations, permission denials — anything the caller can handle.
- **Unexpected:** Infrastructure broken (DB connection, network timeout, OOM) or programmer bugs. Bubble to server boundary → 500.

---

## 2. Design Decisions

### Decision 1: `@vertz/errors` Result is the one Result

The inline duplicates in `@vertz/server` (domain, auth) are deleted and replaced with imports from `@vertz/errors`.

`@vertz/core` Result stays temporarily for backward compatibility but is **deprecated**. New code uses `@vertz/errors` Result exclusively. Migration path: when a route handler needs a custom HTTP status, use the response API directly instead of `core.err(status, body)`.

### Decision 2: Errors Stay as Plain Objects

We do NOT migrate interfaces to classes. The current design is correct:

- Plain objects serialize naturally to JSON
- Factory functions (`createNotFoundError()`) are simple and testable
- Type guards (`isNotFoundError()`) work via `code` discriminant
- No `instanceof` fragility across package boundaries
- LLMs understand plain objects better than class hierarchies

### Decision 3: `code`-Based HTTP Mapping

The server boundary maps error `code` → HTTP status via a centralized lookup:

```typescript
// @vertz/errors — new export
export const HTTP_STATUS_MAP: Record<string, number> = {
  // DB errors
  'NOT_FOUND':            404,
  'UNIQUE_VIOLATION':     409,
  'FK_VIOLATION':         409,
  'NOT_NULL_VIOLATION':   400,
  'CHECK_VIOLATION':      400,

  // Auth errors
  'INVALID_CREDENTIALS':  401,
  'SESSION_EXPIRED':      401,
  'PERMISSION_DENIED':    403,
  'USER_EXISTS':          409,
  'RATE_LIMITED':         429,

  // Schema errors
  'VALIDATION_FAILED':    400,

  // Client errors (same codes, same mapping)
  'UNAUTHORIZED':         401,
  'FORBIDDEN':            403,
  'CONFLICT':             409,
  'VALIDATION_ERROR':     400,

  // Migration errors (these shouldn't hit HTTP, but just in case)
  'MIGRATION_QUERY_ERROR':       500,
  'MIGRATION_CHECKSUM_MISMATCH': 500,
  'MIGRATION_HISTORY_NOT_FOUND': 500,
};

export function httpStatusForError(error: { readonly code: string }): number {
  return HTTP_STATUS_MAP[error.code] ?? 500;
}
```

**Why this works:**
- Every domain error already has `code` — it's the universal discriminant
- One centralized, testable map — easy to audit, easy to extend
- No changes to existing error types
- No class migration
- Errors remain plain JSON-serializable objects

### Decision 4: `AppError` for App Developer Custom Errors

`AppError<C>` remains available for **app developers** who want class-based errors with `toJSON()`. It's not used by the framework's domain errors, but it's useful when developers need custom business errors:

```typescript
// App developer code — optional, not framework-required
class InsufficientBalanceError extends AppError<'INSUFFICIENT_BALANCE'> {
  constructor(public readonly required: number, public readonly available: number) {
    super('INSUFFICIENT_BALANCE', `Need ${required}, have ${available}`);
  }
}
```

The server boundary handles both: if `error` has a `code` field, use `httpStatusForError()`. If `error` is an `AppError` instance, same thing — `AppError` has `code` too.

### Decision 5: Ship `pipe()` From Day One

The `if (!x.ok) return x` pattern is the TypeScript tax for Result-based composition. It works (Go proved `if err != nil` scales), but we ship a `pipe()` helper to reduce boilerplate:

```typescript
// @vertz/errors — new export
export async function pipe<T, E>(
  ...steps: Array<(input: any) => Result<any, any> | Promise<Result<any, any>>>
): Promise<Result<T, E>>
```

Usage:

```typescript
// With pipe — clean
async function refundOrder(orderId: string, ctx: ServiceContext) {
  return pipe(
    () => ctx.db.orders.get(orderId),
    (order) => {
      if (order.status === 'shipped') return err(createForbiddenError('Order already shipped'));
      return ok(order);
    },
    (order) => cancelOrder(order, ctx),
    (cancelled) => processRefundPayment(cancelled.paymentId, ctx),
  );
}

// Without pipe — also fine, just more lines
async function refundOrder(orderId: string, ctx: ServiceContext) {
  const order = await ctx.db.orders.get(orderId);
  if (!order.ok) return order;

  if (order.data.status === 'shipped') {
    return err(createForbiddenError('Order already shipped'));
  }

  const cancel = await cancelOrder(order.data, ctx);
  if (!cancel.ok) return cancel;

  return processRefundPayment(cancel.data.paymentId, ctx);
}
```

Both patterns are valid. `pipe()` is sugar, not a requirement.

---

## 3. Layer-by-Layer Contract

| Layer | Returns | Throws | Notes |
|---|---|---|---|
| **Schema** | `parse()` → `Result<T, SchemaError>` | `assert()` → throws | Two APIs by design |
| **DB (Migrations)** | `Result<T, MigrationError>` | — | Already done (PR #436) |
| **DB (CRUD)** | Currently throws. **Add Result variants.** | Infrastructure (connection, pool) | `get()` → `Result<T, ReadError>`, keep `getOrThrow()` |
| **Services** | `Result<T, DomainError>` | Never for domain logic | Composable, typed |
| **Route handlers** | Return service Result directly | Optional: throw VertzException | Framework auto-maps |
| **Server boundary** | HTTP Response | Catches all throws → 500 | `httpStatusForError()` for Result errors |

### How the Server Boundary Works

```typescript
// Updated app-runner logic (pseudocode)
const result = await entry.handler(ctx);

// 1. Already a Response? Pass through.
if (result instanceof Response) return result;

// 2. @vertz/core Result? (deprecated path, backward compat)
if (isResult(result)) {
  if (isOk(result)) return jsonResponse(result.data, 200);
  return jsonResponse(result.body, result.status);
}

// 3. @vertz/errors Result? (new primary path)
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

// 4. Plain value? Wrap as 200 JSON.
return jsonResponse(result, 200);
```

### Custom HTTP Status (Opt-in)

When you need 201 for creation or other custom responses:

```typescript
import { match } from '@vertz/errors';

route.post('/orders', async (ctx) => {
  const result = await orderService.createOrder(ctx.body, ctx);
  return match(result, {
    ok: (order) => ctx.json(order, 201),
    err: (error) => ctx.json(error, httpStatusForError(error)),
  });
});
```

For 90% of cases, just return the Result and the framework handles it.

---

## 4. Service Composition

### Explicit Pattern (always works)

```typescript
async function refundOrder(
  orderId: string,
  ctx: ServiceContext
): Promise<Result<Refund, DBNotFoundError | ForbiddenError | PaymentError>> {

  const order = await ctx.db.orders.get(orderId);
  if (!order.ok) return order;

  if (order.data.status === 'shipped') {
    return err(createForbiddenError('Order already shipped'));
  }

  const cancel = await cancelOrder(order.data, ctx);
  if (!cancel.ok) return cancel;

  const payment = await processRefundPayment(order.data.paymentId, ctx);
  if (!payment.ok) return payment;

  return ok({
    id: generateId(),
    orderId,
    amount: order.data.total,
    processedAt: new Date(),
  });
}
```

### With `pipe()` (cleaner for longer chains)

```typescript
async function refundOrder(orderId: string, ctx: ServiceContext) {
  return pipe(
    () => ctx.db.orders.get(orderId),
    (order) => order.status === 'shipped'
      ? err(createForbiddenError('Order already shipped'))
      : ok(order),
    (order) => cancelOrder(order, ctx),
    (cancelled) => processRefundPayment(cancelled.paymentId, ctx),
    (payment) => ok({
      id: generateId(),
      orderId,
      amount: payment.amount,
      processedAt: new Date(),
    }),
  );
}
```

### Error Type Accumulation

Error unions grow as services compose. This is correct — the signature documents what can fail:

```typescript
Result<Refund, DBNotFoundError | ForbiddenError | PaymentError>
```

At the server boundary, all errors have `code`. The `httpStatusForError()` map handles them uniformly. Union size doesn't matter to the auto-mapper.

If a union grows beyond ~5 types, decompose the service.

---

## 5. DB CRUD Migration

Current API:
```typescript
const user = await db.users.getOrThrow(id);  // throws NotFoundError
const user = await db.users.get(id);          // returns T | null
```

New API (additive, non-breaking):
```typescript
// New: returns Result
const result = await db.users.find(id);         // Result<T, ReadError>
const result = await db.users.create(data);      // Result<T, WriteError>

// Existing: keep as convenience (like assert() for schema)
const user = await db.users.getOrThrow(id);      // T (throws)
const user = await db.users.get(id);             // T | null
```

The `find` / `findOrThrow` naming follows the `parse` / `assert` pattern:
- Result-returning method is the primary, composable API
- Throwing method is the convenience shortcut

---

## 6. What About `VertzException`?

`VertzException` and its HTTP subclasses (`NotFoundException`, etc.) stay unchanged. They're the **throw-based** path for route handlers who prefer that style:

```typescript
// This still works — throw at route level
route.get('/users/:id', async (ctx) => {
  const user = await db.users.get(ctx.params.id);
  if (!user) throw new NotFoundException('User not found');
  return user;
});
```

We don't merge `VertzException` and `AppError`. They serve different purposes:
- `VertzException` → HTTP exceptions thrown in route handlers, caught by server boundary
- `AppError` → Optional base class for app developer custom errors, used with Result

Long-term, as the codebase moves to Result-based services, `VertzException` usage naturally decreases. No forced migration needed.

---

## 7. Gaps (Future Work)

Not covered by this design doc:
- **Streaming/SSE errors** — mid-stream failures need a different model
- **WebSocket errors** — different transport, different lifecycle
- **Batch operations** — `Result<T[], E>` vs `Result<T, E>[]` (partial success)
- **Middleware errors** — auth middleware: throw or Result?
- **Cancellation/timeout** — AbortController integration with Result
- **Retry semantics** — which errors are retryable?

---

## 8. Migration Path

| Phase | What | Breaking? | Scope |
|---|---|---|---|
| **1 (done)** | `@vertz/errors` shipped — Result, AppError, domain errors | No | PR #420 |
| **2 (done)** | Migration runner returns Result | No | PR #436 |
| **3** | Add `httpStatusForError()` + `HTTP_STATUS_MAP` to `@vertz/errors` | No (additive) | ~1 file |
| **4** | Add `pipe()` to `@vertz/errors` | No (additive) | ~1 file + tests |
| **5** | Server boundary detects `@vertz/errors` Result, uses `httpStatusForError()` | No (additive) | app-runner.ts |
| **6** | `@vertz/schema` — `parse()` → Result, `assert()` → throw | Yes (API change) | #398 |
| **7** | `@vertz/db` CRUD — add Result-returning variants (`find()`, etc.) | No (additive) | New |
| **8** | Deprecate `@vertz/core` Result | No (deprecation warning) | Later |
| **9** | Remove inline Result duplicates from server | Cleanup | Internal |

Phases 3-5 can ship immediately as one PR. No breaking changes, no migration needed.

---

## 9. Decision Summary

| Question | Answer |
|---|---|
| Which Result type? | `@vertz/errors` — `{ ok, data }` / `{ ok, error }` |
| Do errors become classes? | **No.** Stay as plain interfaces + factory functions. |
| How does auto-mapping work? | `httpStatusForError(error)` — maps `code` → HTTP status |
| Where is the map? | Centralized in `@vertz/errors`, one object, testable |
| Do services return Result or throw? | **Result** for domain errors. Infra throws. |
| Does the route handler unwrap? | **No.** Return the Result, framework maps it. |
| What about `AppError`? | Available for app developers. Framework errors use plain objects. |
| What about `VertzException`? | Stays. Separate concern (HTTP throws in route handlers). |
| Is there a `pipe()` helper? | **Yes, ships from day one.** |
| What about the `if (!x.ok)` pattern? | Also valid. `pipe()` is sugar, not mandatory. |
| What about DB CRUD? | Add Result-returning variants. Keep existing throwing methods. |
| What about `@vertz/core` Result? | Deprecated. Backward compat maintained, removed later. |

---

## 10. Why Not Throw-by-Default?

We considered throw-based services (see `plans/debate-throw-advocate.md`). The key arguments against:

1. **No type safety on errors.** TypeScript doesn't type throws. You can't know what a function throws without reading the implementation. Result makes this explicit in the signature.
2. **Composition requires try/catch nesting.** Service A calls Service B calls Service C — with throws, you get nested try/catch or silent bubbling. With Result, you get flat `if (!x.ok)` or `pipe()`.
3. **LLM-unfriendly.** An AI agent can't determine error handling from a function signature if it throws. With Result, the signature is the documentation.
4. **Industry trajectory.** Go (`if err != nil`), Rust (`?`), Effect-TS, and the TC39 safe-assignment proposal (`?=`) all point toward errors-as-values. We're betting on where the language is heading.

Throws remain available for route handlers (`VertzException`) and app developer convenience. We're not banning throw — we're making Result the primary path for composable business logic.

---

## 11. Why Not Hybrid (Internal Result, Top-Level Throw)?

We considered Model B from the debate (see `plans/debate-hybrid-advocate.md`): internal service functions return Result, top-level service methods convert to throw for simpler route handlers.

**Why we rejected it:**

1. **The conversion layer is pure boilerplate.** Every top-level method is just `if (!result.ok) throw result.error` repeated. That's not simplification — it's moving complexity.
2. **Two mental models in one service.** Internal functions return Result, top-level throws. Which pattern am I in? This confuses both developers and LLMs.
3. **Auto-mapping eliminates the motivation.** The hybrid exists because route handlers "shouldn't deal with Result." But with `httpStatusForError()` auto-mapping, route handlers just return the Result — no dealing needed.
