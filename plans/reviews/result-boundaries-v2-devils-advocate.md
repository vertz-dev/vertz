# Devil's Advocate Review: Result Boundaries v2

**Reviewer:** Devil's Advocate (v2)  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md` (v2)  
**Context:** Follow-up to v1 review

---

## Executive Summary

v2 is a significant revision that addresses some v1 concerns while introducing new ones. The doc now acknowledges complexity it previously ignored. However, the fundamental tension—Result in TypeScript without syntactic sugar—remains unresolved, and the "solution" adds more moving parts than it removes.

---

## 1. Were v1 Concerns Addressed?

### 1.1 "Why Not Throw?" — Partially Addressed

**v1 Claim:** The doc dismissed throw with one sentence, ignoring that throw is the industry standard.

**v2 Treatment:** The doc now includes the throw advocate's position paper as an appendix. This is progress—it's actually referenced in the v2 doc as a "rejected" approach.

**Verdict:** Deflected, not addressed. The doc says throw was "rejected as boilerplate" but never quantifies that boilerplate. The hybrid advocate's point is strong: top-level services throw, internal services use Result. That's ONE extra function per service, vs. `if (!x.ok) return x` at EVERY call site.

### 1.2 The `if (!x.ok) return x` Problem — IGNORED

**v1 Claim:** Quantified the boilerplate with a 10-step service example.

**v2 Treatment:** The doc acknowledges this is "the TypeScript tax" but doubles down:

> "Future improvement: We may add a `pipe()` helper if this proves painful in practice."

**Verdict:** IGNORED. This is the same non-commitment as v1. You need `pipe()` from day one because:

```typescript
// This is what you're asking developers to write
const a = await step1();
if (!a.ok) return a;
const b = await step2(a.data);
if (!b.ok) return b;
const c = await step3(b.data);
if (!c.ok) return c;
const d = await step4(c.data);
if (!d.ok) return d;
const e = await step5(d.data);
if (!e.ok) return e;
return e.data;
```

vs. throw:
```typescript
const a = await step1();
const b = await step2(a);
const c = await step3(b);
const d = await step4(c);
const e = await step5(d);
return e;
```

The doc says pipe will come "if developers ask for it." But developers won't ask—they'll just write worse code or switch frameworks.

### 1.3 Auto-Mapping Magic — PARTIALLY ADDRESSED

**v1 Claim:** No mechanism enforces AppError inheritance. Runtime errors from plain objects.

**v2 Treatment:** The doc now says:

> "This works when error types in `@vertz/errors` domain modules are classes (which they are for `AppError` subclasses). For the plain interface errors (like `NotFoundError` in `db.ts`), we need to migrate them to classes."

So the enforcement is: migrate interfaces to classes. This is a workaround, not a solution.

**Verdict:** PARTIALLY ADDRESSED via migration, but introduces MORE work (see section 4).

### 1.4 Hybrid Dismissal — DEFLECTED

**v1 Claim:** The hybrid approach deserves more than one sentence of dismissal.

**v2 Treatment:** The doc now includes the hybrid advocate's full position paper. But the response is still:

> "Route handlers stay thin — framework auto-maps"

This assumes the auto-mapping always works. But what when you need custom HTTP response? You still need:

```typescript
return result.match({
  ok: (data) => ctx.json(data, 201),
  err: (error) => ctx.json(error.toJSON(), error.httpStatus),
});
```

That's NOT thin. That's the same as the hybrid route handler:

```typescript
try {
  return ctx.json(await service.call());
} catch (e) {
  return mapToHttp(e);
}
```

**Verdict:** DEFLECTED. The doc claims route handlers are simpler with auto-mapping, but the opt-out case is just as complex as hybrid.

### 1.5 Migration Cost — NOT ADDRESSED

**v1 Claim:** Breaking changes need quantification and tooling.

**v2 Treatment:** The doc provides a 7-phase migration plan but no estimates:

- How long? Unknown
- How many PRs? Unknown  
- Blast radius per phase? Not quantified

**Verdict:** NOT ADDRESSED.

---

## 2. The Unification Plan Creates MORE Complexity

The doc claims this simplifies error handling, but let's count the changes:

| Change | Complexity Added |
|--------|------------------|
| 1. AppError gets `httpStatus` | New property, all AppError subclasses need it |
| 2. VertzException extends AppError | Hierarchy change, need backward compat |
| 3. Server detects two Result types | @vertz/core (branded) + @vertz/errors (plain) |
| 4. DB errors: interfaces → classes | Massive migration |
| 5. @vertz/core Result stays as escape hatch | Two Result types to choose from |

**That's 5 changes to avoid writing:**

```typescript
// What the auto-mapping saves:
try {
  return await service.method();
} catch (e) {
  return mapToHttp(e);
}
```

**Is this simpler than just throwing?**

The throw advocate's model:
- Services throw AppError
- Server catches and maps to HTTP
- ONE change: AppError carries httpStatus

The Result model:
- Services return Result
- AppError carries httpStatus
- Server detects two Result types
- DB errors become classes
- @vertz/core Result stays for edge cases
- **Still needs helper for custom responses**

The throw model requires ONE change. This requires FIVE.

---

## 3. Two Result Types is Worse Than One

The doc keeps `@vertz/core` Result as an "escape hatch":

```typescript
// When you need explicit HTTP control (not tied to AppError)
import { ok, err } from '@vertz/core';
return err(301, { location: '/new-url' });
```

**But this WILL cause bugs:**

```typescript
// Developer imports wrong one
import { ok, err } from '@vertz/errors';  // or @vertz/core?

// Both compile, both work, but:
// - @vertz/errors Result: auto-maps via AppError.httpStatus
// - @vertz/core Result: uses explicit status from result.status

// The server tries to detect:
// if (isResult(result)) { ... }  // @vertz/core (branded)
// if (result && typeof result === 'object' && 'ok' in result) { ... } // @vertz/errors
```

**This is a footgun.** Developers will import the wrong one. The types look identical:

```typescript
// Both packages export:
type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };
```

The only difference is branding (Symbol). The server has to disambiguate at runtime. This is fragile.

**Better solution:** One Result type. If you need custom HTTP status, return it from the error:

```typescript
class RedirectError extends AppError<'REDIRECT'> {
  constructor(to: string) {
    super('REDIRECT', to, 301);  // 301 is httpStatus
  }
  toJSON() { return { location: this.message }; }
}
```

The doc didn't consider this. It just said "keep @vertz/core Result for escape hatch" without exploring alternatives.

---

## 4. The Interface-to-Class Migration is Buried

The doc says:

> "For the plain interface errors (like `NotFoundError` in `db.ts`), we need to migrate them to classes."

**This is buried in Section 5, almost as an afterthought.** But this is a MASSIVE change:

Current state (`@vertz/db`):
```typescript
// These are INTERFACES
interface NotFoundError {
  code: 'NOT_FOUND';
  resource: string;
  id: string;
}

interface UniqueViolationError {
  code: 'UNIQUE_VIOLATION';
  field: string;
  value: string;
}
```

Required state:
```typescript
// These become CLASSES extending AppError
class NotFoundError extends AppError<'NOT_FOUND'> {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404);
  }
}

class UniqueViolationError extends AppError<'UNIQUE_VIOLATION'> {
  constructor(field: string, value: string) {
    super('UNIQUE_VIOLATION', `${field} already exists`, 409);
  }
}
```

**What's the blast radius?**

- Every file that returns these errors must change
- Every file that type-guards these errors must change  
- Every file that constructs these errors must change
- Tests must change
- The change is from structural typing (interfaces) to nominal typing (classes)

**The doc treats this as:** "Oh, and we'll need to migrate interfaces to classes at some point."

**This deserves its own section with:**

- Full list of affected errors
- Migration strategy (codemod?)
- Timeline
- Backward compatibility plan

---

## 5. "Ship pipe later" is Still the Wrong Call

The doc says:

> "Future improvement: We may add a `pipe()` helper if this proves painful in practice."

**This is the same answer as v1.** And it's wrong because:

### 5.1 You Need It Day One

```typescript
// This is the REAL code developers will write
async function createOrder(input) {
  const validated = validate(input);
  if (!validated.ok) return validated;
  
  const customer = await getCustomer(validated.data.customerId);
  if (!customer.ok) return customer;
  
  const inventory = await checkInventory(validated.data.items);
  if (!inventory.ok) return inventory;
  
  const payment = await processPayment(validated.data.payment);
  if (!payment.ok) return payment;
  
  const order = await saveOrder(validated.data, payment.data);
  if (!order.ok) return order;
  
  const email = await sendConfirmation(order.data);
  if (!email.ok) return email;
  
  return order.data;
}
```

**7 steps = 7 identical lines.** This is not "repetitive"—it's noise that obscures the actual logic.

### 5.2 The Doc Shows a pipe() Example But Doesn't Ship It

The doc actually shows what pipe() would look like:

```typescript
const refund = await pipe(
  () => ctx.db.orders.get(orderId),
  (order) => order.status === 'shipped'
    ? err(new ForbiddenError('ORDER_ALREADY_SHIPPED'))
    : ok(order),
  (order) => cancelOrder(order, ctx),
  (cancelled) => processRefundPayment(cancelled.paymentId, ctx),
);
```

**But it's in a "Potential future helper" block.** This is taunting developers.

### 5.3 Rust Has `?` Because This Pattern is Painful

The doc says:

> "This is the same distinction Rust, Go, and Effect-TS make — just without language-level syntax sugar."

**Exactly.** Rust has `?` because `if (!result.ok) return result` is painful. TypeScript doesn't have `?`. So we need a helper.

**Ship pipe() in Phase 1. Not Phase "whenever."**

---

## 6. Industry Comparison is Still Missing

**v1 Asked For:** Real-world comparison with tRPC, Remix, Hono.

**v2 Has:** Still nothing.

The doc acknowledges that tRPC/Remix/Hono use throw-based models but doesn't explain why Vertz is choosing the experimental path.

| Framework | Model | Production Proven |
|-----------|-------|------------------|
| tRPC | Throw (TRPCError) | ✅ Massive |
| Remix | Throw (Response) | ✅ Massive |
| Hono | Throw (HTTPException) | ✅ |
| Next.js | Throw | ✅ Massive |
| Vertz (proposed) | Result + auto-map | ❓ Experimental |

**The question the doc refuses to answer:** Why is Vertz choosing a pattern that NO major TypeScript framework uses?

The hybrid advocate points out:
- tRPC uses throw + typed errors
- Remix uses throw + Response
- Both are simpler than Result + auto-mapping

The doc should address this directly, not just append the position papers and move on.

---

## 7. Is the Migration Path Realistic?

The doc lists 7 phases:

| Phase | What | Questions |
|-------|------|-----------|
| 1 (done) | @vertz/errors shipped | ✅ |
| 2 (done) | Migration runner returns Result | ✅ |
| 3a | Add httpStatus to AppError | How long? |
| 3b | VertzException extends AppError | Breaking? |
| 3c | Server detects @vertz/errors Result | How complex? |
| 4 | @vertz/schema parse() → Result | When? |
| 5 | @vertz/db CRUD → Result | When? |
| 6 | @vertz/client error vocabulary | When? |
| 7 | Remove inline duplicates | When? |

**Missing:**

- **Timeline:** Weeks? Months? Q3 2026?
- **PR count:** 1 PR per phase? 5?
- **Blast radius:** What breaks in each phase?
- **Who owns this:** One person? Team?
- **Rollback plan:** What if Phase 3c breaks existing routes?

The hybrid advocate's model could ship in 2 phases:
1. AppError gets httpStatus
2. Document "top-level services throw"

That's it. The Result-based approach needs 7 phases.

---

## 8. What v2 Does Better (Acknowledging Progress)

Credit where due:

1. **Acknowledges multiple Result types** — v1 pretended there was only one
2. **Includes position papers** — Shows the debate, not just the outcome
3. **AppError gets httpStatus** — This was necessary and correct
4. **VertzException extends AppError** — Consolidation, good
5. **DB CRUD adds Result variants** — Not replacing, adding (smart)
6. **Keep getOrThrow()** — Backward compatibility, good

---

## 9. Additional Concerns

### 9.1 The Error Union Growth Still Not Solved

> "If a union grows beyond ~5 error types, that's a signal the service is doing too much."

This is hand-wavy:

- Why 5 and not 10?
- Real-world services often touch multiple domains
- "Decompose" is not a simple operation

A refund service touching orders, inventory, payments, and notifications could easily have 6-8 error types. That's not "doing too much"—that's a legitimate business operation.

### 9.2 The "LLM-Friendly" Claim is Untested

v1 called this out. v2 repeats it without evidence:

> "LLM-friendly — AI agents get this right on the first prompt"

This is faith, not evidence. LLMs are trained on throw-based JavaScript. Result patterns may actually confuse them.

### 9.3 No Escape Hatch for Gradual Migration

What if someone wants to try Result in one service but not another? The doc doesn't provide:
- A `tryCatch` helper to convert throws to Result
- Guidelines for partial migration
- "Breaking the rules" documentation

---

## 10. Verdict

### What v2 Gets Right

1. Acknowledging multiple Result types existed
2. Including the debate positions
3. AppError httpStatus consolidation
4. Keeping backward-compatible methods (getOrThrow, etc.)

### What v2 Gets Wrong

1. **5 changes for auto-mapping is more complex than throw** — The math doesn't work
2. **Two Result types causes confusion** — Import errors are inevitable  
3. **Interface-to-class migration is buried** — This is a huge change
4. **pipe() still deferred** — Ship it day one
5. **No industry comparison** — Why are we choosing the experimental path?
6. **Migration has no timeline** — 7 phases with no dates

### The Core Question

The doc claims Result is simpler. But:

- Throw: 1 change (AppError gets httpStatus)
- Result: 5 changes (above list)

Where is the simplicity? The boilerplate argument falls flat when you count the infrastructure changes required.

The hybrid advocate's model (internal Result, top-level throw) achieves:
- Service composition without boilerplate
- Simple route handlers (standard try/catch)
- ONE change: AppError gets httpStatus

**Recommendation:** The team should seriously reconsider the hybrid approach. It's less complex, matches industry patterns, and achieves the same goals with less machinery.

---

*Review by Devil's Advocate v2 — still finding holes*
