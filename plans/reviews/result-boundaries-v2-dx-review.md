# DX Review: result-boundaries.md (v2)

**Reviewer:** DX Review Subagent  
**Date:** 2026-02-18  
**File:** `/Users/viniciusdacal/openclaw-workspace/vertz/plans/result-boundaries.md` (v2)  
**Context:** Reviewed against shipped `@vertz/errors` code and v1 review

---

## Executive Summary

The v2 doc addresses some critical issues from v1 but **introduces new problems** and leaves several old ones unresolved. The doc is now ahead of implementation (proposing `httpStatus` on `AppError` which doesn't exist yet), which is risky for a design doc. Key remaining issues: the `err()` + `AppError` pattern is still wrong, the PERMISSION_DENIED/FORBIDDEN split remains unresolved, and flatMap is still ignored.

---

## 1. Were Previous Issues Fixed?

### ✅ Fixed

| Issue | v1 Status | v2 Status |
|-------|-----------|------------|
| `.value` vs `.data` | Used `.value` (wrong) | **Now uses `.data` correctly** — e.g., `order.data.status` (line 147) |

### ⚠️ Partially Fixed

| Issue | v1 Status | v2 Status |
|-------|-----------|------------|
| Missing `httpStatus` | Not on shipped `AppError` | **Doc proposes adding it** — shows updated `AppError` with `httpStatus: number` (lines 52-67). This is a proposal, not shipped. Risk: doc is ahead of code. |
| Gaps coverage | Very limited | **Added Section 6** with streaming, WebSocket, batch, middleware, client gaps. But still missing: cancellation, timeout, retry, graceful degradation |

### ❌ Not Fixed

| Issue | v1 Status | v2 Status |
|-------|-----------|------------|
| `err()` with AppError | Wrong pattern shown | **Still wrong** — line 148: `return err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))` — `err()` expects a plain object, not an Error instance. This will have weird runtime behavior. |
| PERMISSION_DENIED vs FORBIDDEN | Auth has PERMISSION_DENIED, client has FORBIDDEN | **Still inconsistent** — doc uses `ForbiddenError` (line 148, 165), but shipped `domain/auth.ts` has `PERMISSION_DENIED`. Doc doesn't address this. |
| flatMap not mentioned | Exists in shipped code, doc ignored it | **Still not mentioned** — shipped `result.ts` has `flatMap()` function. Doc line 165 shows manual `if (!order.ok) return order` instead of using `flatMap()`. |

---

## 2. Learnability

### Can a junior dev understand this in 10 minutes?

**Verdict: No — it's overwhelming and internally inconsistent.**

The doc grew from ~150 lines to ~300 lines. While more detailed, it adds confusion:

1. **Two-Result world is not explained** — Section 0 mentions `@vertz/core` Result AND `@vertz/errors` Result. Section 5 mentions `@vertz/core` Result as "escape hatch." A junior dev won't know when to use which.

2. **The doc proposes things that don't exist** — The `AppError` with `httpStatus` (lines 52-67) is a **proposal**, not shipped code. A junior dev reading this would expect `httpStatus` to work today.

3. **The `err()` pattern is misleading** — Showing `err(new ForbiddenError(...))` (line 148) teaches wrong behavior. The correct way is `err({ code: 'FORBIDDEN', message: '...' })` or using the factory function.

4. **No clear decision tree** — The "Layer-by-Layer Contract" table (lines 109-119) is dense. A junior dev needs a simpler flowchart:
   - "Is it infrastructure?" → throw
   - "Is it expected business logic?" → return Result
   - "Do I need custom HTTP status?" → use @vertz/core Result

---

## 3. LLM-Friendliness

### Can an AI agent write correct code from this spec on first prompt?

**Verdict: No — it will write broken code.**

| Problem | Impact | Example from Doc |
|---------|--------|------------------|
| `err()` with Error instance | **Runtime bug** | Line 148: `err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))` — This creates `{ ok: false, error: <ForbiddenError instance> }`. When the server tries to serialize, it gets an object with constructor name, not `{ code, message }`. |
| Missing `httpStatus` | **Compile/runtime error** | Line 222: `error.httpStatus` — doesn't exist on shipped `AppError`. Code will crash or be undefined. |
| Wrong error code | **Type mismatch** | Uses `ForbiddenError` but auth returns `PERMISSION_DENIED`. LLM generates client code expecting `FORBIDDEN`, server returns `PERMISSION_DENIED`. |
| No flatMap | **Verbose code** | Doc doesn't mention `flatMap`, so LLM writes manual `if (!x.ok) return x` chains instead of using the shipped utility. |

### Quote from doc that will break:

```typescript
// Line 148 — WRONG
if (order.data.status === 'shipped') {
  return err(new ForbiddenError('ORDER_ALREADY_SHIPPED'));
}
```

The `err()` function signature (from shipped `result.ts`):
```typescript
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

Passing an `Error` instance means `result.error` is an object with `name: 'ForbiddenError'`, `message: '...'`, `stack: '...'`. Not `{ code: 'FORBIDDEN', message: '...' }`.

---

## 4. Code Examples

### Do they use `.data` (correct) now?

**Yes** — v2 correctly uses `.data` throughout:
- Line 130: `order.data.status`
- Line 131: `cancelOrder(order.data, ctx)`
- Line 134: `processRefundPayment(order.data.paymentId, ctx)`
- Line 140: `order.data.total`

### Do the AppError examples match what would compile?

**Partially** — The doc shows two things:

1. **Proposed `AppError` with `httpStatus`** (lines 52-67):
```typescript
export class AppError<C extends string = string> extends Error {
  readonly code: C;
  readonly httpStatus: number;
  constructor(code: C, message: string, httpStatus: number = 500) {
    // ...
  }
}
```
This **doesn't match shipped code**. Shipped `AppError` (in `app-error.ts`) has no `httpStatus`. This is a proposal.

2. **AppError subclasses** (lines 69-92):
```typescript
class NotFoundError extends AppError<'NOT_FOUND'> {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404);
  }
}
```
This **won't compile** because shipped `AppError` constructor is:
```typescript
constructor(code: C, message: string) // only 2 params!
```
Not 3 params with `httpStatus`.

**Verdict:** Examples are aspirational, not matching shipped code. The doc should either:
- Mark these as "proposed changes" clearly, OR
- Use the shipped API (without `httpStatus`) and show mapping via separate functions

---

## 5. The Two-Result World

### Is this confusing for developers?

**Yes — the doc doesn't adequately explain when to use which.**

| Result Type | Package | When to Use |
|-------------|---------|-------------|
| `@vertz/errors` Result | `@vertz/errors` | Business logic, services |
| `@vertz/core` Result | `@vertz/core` | Route handlers needing explicit HTTP control |

### What the doc says:

- Line 101: "`@vertz/errors` Result wins" — replace duplicates
- Line 105: Keep `@vertz/core` Result as "escape hatch"
- Line 107: Example shows `err(301, { location: '/new-url' })` for redirect

### What's missing:

**No clear guidance on:**
1. How does an LLM know when "explicit HTTP control" is needed vs auto-mapping?
2. If I return `@vertz/errors` Result from a route, does it auto-map? (Yes, line 187 says "auto-maps")
3. What's the actual difference between the two Result shapes?

The `@vertz/core` Result has `{ ok: false, status: number, body: E }` (from Section 0). The `@vertz/errors` Result has `{ ok: false, error: E }`. The doc mentions this but doesn't give a simple decision rule.

**Recommendation:** Add a simple flowchart:
```
Need custom HTTP status (not from AppError)? → @vertz/core Result
Otherwise → @vertz/errors Result
```

---

## 6. New Gaps

### Section 6 lists these gaps:
- Streaming/SSE errors
- WebSocket errors
- Batch operations
- Middleware errors
- Client error vocabulary

### Still missing from gaps:

| Gap | Impact |
|-----|--------|
| **Cancellation** | How to handle request cancellation? Throw? Return Result? |
| **Timeout handling** | TimeoutError throws but when? Who catches it? |
| **Retry logic** | When to retry vs return Result? |
| **Graceful degradation** | What if one service in a chain is down but others work? |

The doc mentions infrastructure throws (line 13) but doesn't cover timeout handling specifically. `TimeoutError` exists in `infra/index.ts` but there's no guidance on when to catch vs let bubble.

---

## 7. The `getOrThrow` / `get` Dual API

### Is this pattern clear?

**Yes** — Section 3 (DB CRUD Migration) explains it well:

```typescript
// Result-returning
const user = await db.users.get(id);        // Result<User, NotFoundError>
const user = await db.users.getOrThrow(id);  // User (throws on not-found)
```

### Does it mirror `parse` / `assert` well?

**Yes** — The analogy works:
- `parse()` → Result (caller decides handling)
- `assert()` → throws (failure is exceptional)
- `get()` → Result
- `getOrThrow()` → throws

The doc explicitly draws this parallel (lines 121-127). This is well done.

---

## Summary of Critical Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `err(new ForbiddenError(...))` is wrong | **Critical** | Not fixed |
| 2 | `httpStatus` on AppError doesn't exist | **Critical** | Proposed (not shipped) |
| 3 | PERMISSION_DENIED vs FORBIDDEN mismatch | **High** | Not fixed |
| 4 | flatMap not mentioned (exists in shipped code) | **Medium** | Not fixed |
| 5 | No clear two-Result decision rule | **Medium** | Partially addressed |
| 6 | Examples show non-shipped API | **High** | New problem in v2 |

---

## Recommendations

### Must Fix (Critical)

1. **Fix `err()` pattern** — Change all examples to use:
   ```typescript
   // Option 1: Plain object
   return err({ code: 'FORBIDDEN', message: 'ORDER_ALREADY_SHIPPED' });
   
   // Option 2: Factory function (if exists)
   return err(createPermissionDeniedError('ORDER_ALREADY_SHIPPED'));
   ```

2. **Clarify `httpStatus` status** — Either:
   - Remove from examples until shipped, OR
   - Add big banner: "⚠️ PROPOSED — not yet implemented"

3. **Resolve PERMISSION_DENIED vs FORBIDDEN** — Pick one. Either:
   - Change auth to use `FORBIDDEN`, OR
   - Document the mapping layer

### Should Fix

4. **Mention flatMap** — Add to Service Composition section:
   ```typescript
   // Instead of manual chains, use flatMap:
   const refund = await flatMap(
     () => ctx.db.orders.get(orderId),
     (order) => order.status === 'shipped'
       ? err(createPermissionDeniedError('Order already shipped'))
       : ok(order)
   );
   ```

5. **Add two-Result flowchart** — Simple visual decision aid

6. **Cover remaining gaps** — cancellation, timeout, retry, graceful degradation

---

## Final Verdict

The v2 doc is **better than v1** (fixed `.data`, added gaps section) but still **not ready for developer consumption**. The biggest risk: the doc is now **ahead of implementation** — proposing `httpStatus` on `AppError` that doesn't exist. An LLM or junior dev following this doc will write code that doesn't compile or has runtime bugs.

**Action required:** Fix the critical `err()` pattern, clarify what's shipped vs proposed, and resolve the PERMISSION_DENIED/FORBIDDEN inconsistency before publishing.
