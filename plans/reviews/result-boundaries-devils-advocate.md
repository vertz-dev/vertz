# Devil's Advocate Review: Result Boundaries Design

**Reviewer:** Devil's Advocate  
**Date:** 2026-02-18  
**Doc:** `plans/result-boundaries.md`  
**Status:** Critical Review

---

## Executive Summary

The Result Boundaries design has merit, but the doc exhibits several blind spots that deserve scrutiny. This review challenges the key assumptions and identifies gaps that could cause problems in practice.

---

## 1. Why Not Throw? Steel-Manning the Throw Position

### The Doc's Treatment

The doc dismisses throw with a single sentence: "This is the same distinction Rust, Go, and Effect-TS make — just without language-level syntax sugar." This is a weak argument because:

1. **Rust has `?`** — The "no sugar" point ignores that `?` is the entire reason Result works in Rust. Without it, Rust code would look exactly like the boilerplate the doc complains about.

2. **Go has explicit error checking** — But Go's `if err != nil` is literally the same pattern as `if (!x.ok) return x`. The doc criticizes this boilerplate for TypeScript but accepts it for Go.

3. **Effect-TS has `tryCatch` and `orElse`** — The ecosystem has extensive error handling utilities that make Result practical.

### Real-World Comparison: What Actually Works

I examined what tRPC, Remix, and other successful frameworks actually do:

| Framework | Error Model | Key Insight |
|-----------|-------------|-------------|
| **tRPC** | **Throw-based** | `throw new TRPCError({ code: 'UNAUTHORIZED' })` |
| **Remix** | **Throw-based** | `throw json("Not Found", { status: 404 })` — throws Response objects |
| **Next.js API** | **Throw-based** | Standard try/catch |
| **Hono** | **Throw-based** | Throws `HTTPException` |
| **Rust/Axum** | Result with `?` | Has syntactic sugar |
| **Effect-TS** | Result with operators | Extensive composition utilities |

**The pattern is clear:** Frameworks with throw-based models (tRPC, Remix, Hono) are widely adopted and production-proven. Frameworks pushing Result in TypeScript (without significant syntactic sugar) are niche.

### Why Result STILL Wins (Despite This)

Despite the industry preference for throws, the doc makes valid points:

1. **Type safety is real** — With throws, you lose compile-time enforcement of error handling. The throw advocate's JSDoc solution (`@throws`) is optional and not enforced.

2. **LLM reasoning** — An AI agent can see the Result return type and understand what can fail. With throws, the agent must read implementation or documentation.

3. **Testing ergonomics** — Result makes unit testing cleaner: `expect(result.ok).toBe(false)` vs. `expect(fn).rejects.toThrow()`.

4. **Composition without try/catch pyramids** — The doc's flat propagation pattern is genuinely cleaner than nested try/catch for complex service orchestration.

**Verdict:** The doc should acknowledge that throw is the industry standard but argue that Result provides superior type safety and composability at the cost of boilerplate. The current framing (dismissing throw with a single sentence) is intellectually dishonest.

---

## 2. The `if (!x.ok) return x` Problem — The Doc's Biggest Blind Spot

### The Real Cost

The doc says:
> "Yes, `if (!x.ok) return x` is repetitive. Rust has `?`, we don't. But this pattern is: Explicit, Greppable, Type-safe, LLM-friendly."

Let's quantify the "repetitive" part with a realistic 10-step service:

```typescript
async function createOrderWithFulfillment(
  input: CreateOrderInput,
  ctx: ServiceContext
): Promise<Result<Order, ValidationError | NotFoundError | OutOfStockError | 
  PaymentError | InventoryError | ShippingError | FraudCheckError | 
  EmailError | OrderLimitError | InternalError>> {
  
  // Step 1: Validate input
  const validated = validateOrderInput(input);
  if (!validated.ok) return validated; // LINE 1

  // Step 2: Check customer exists
  const customer = await findCustomer(validated.value.customerId, ctx);
  if (!customer.ok) return customer; // LINE 2

  // Step 3: Check order limit
  const limitCheck = await checkOrderLimit(customer.value, ctx);
  if (!limitCheck.ok) return limitCheck; // LINE 3

  // Step 4: Fraud check
  const fraud = await checkFraud(validated.value, ctx);
  if (!fraud.ok) return fraud; // LINE 4

  // Step 5: Check inventory
  const inventory = await checkInventory(validated.value.items, ctx);
  if (!inventory.ok) return inventory; // LINE 5

  // Step 6: Reserve inventory
  const reserved = await reserveInventory(inventory.value, ctx);
  if (!reserved.ok) return reserved; // LINE 6

  // Step 7: Process payment
  const payment = await processPayment(validated.value.payment, ctx);
  if (!payment.ok) return payment; // LINE 7

  // Step 8: Create order record
  const order = await createOrderRecord(validated.value, payment.value, ctx);
  if (!order.ok) return order; // LINE 8

  // Step 9: Update fulfillment
  const fulfillment = await createFulfillment(order.value, ctx);
  if (!fulfillment.ok) return fulfillment; // LINE 9

  // Step 10: Send confirmation
  const email = await sendConfirmationEmail(order.value, ctx);
  if (!email.ok) return email; // LINE 10

  return ok(order.value);
}
```

**That's 10 lines of near-identical boilerplate.** The doc says "we may add a `pipe()` or `chain()` helper later if the repetition proves painful in practice." This is backwards — you need this helper from day one, not "later."

### The Doc's Response: "Use flatMap"

The doc does show `flatMap`/`andThen`:

```typescript
const cancel = await cancelOrder(order.value, ctx);
if (!cancel.ok) return cancel;
```

But `flatMap` doesn't actually reduce the boilerplate for sequential async operations:

```typescript
// What flatMap actually looks like with async
return flatMap(
  await cancelOrder(order.value, ctx),
  async (cancelled) => flatMap(
    await processRefund(cancelled, ctx),
    async (refund) => ok({ order: cancelled, refund })
  )
);
```

This is **less readable** than the explicit version. The nested callbacks are harder to debug, and error line numbers become meaningless.

### What the Doc Should Have Said

The doc should:
1. **Quantify the cost** — Show a realistic 10-step service with all the boilerplate
2. **Commit to helpers day one** — Not "later if it proves painful"
3. **Admit the ergonomics gap** — Rust's `?` exists because this pattern is painful. We need equivalent ergonomics.

---

## 3. Auto-Mapping Magic — Unanswered Questions

### The Claim

> "Every `AppError` subclass carries its own HTTP status code and serialization. The server boundary uses this to auto-map Result → HTTP Response."

### What Could Go Wrong

**Scenario 1: Multiple error types with different HTTP statuses**

```typescript
// What if service returns this?
Result<T, NotFoundError | ForbiddenError>

// Both extend AppError. Both have httpStatus.
// What determines which status gets returned?
// The doc doesn't explain.
```

**Scenario 2: Plain object errors**

```typescript
// Developer does this (it compiles!):
async function getUser(id: string): Promise<Result<User, { message: string }>> {
  const user = await db.find(id);
  if (!user) return err({ message: 'User not found' }); // NOT an AppError!
}

// Server tries: result.error.httpStatus
// Runtime error: Cannot read property 'httpStatus' of undefined
```

**Scenario 3: Missing `httpStatus`**

```typescript
// Developer creates custom error
class CustomError extends Error {
  // Forgot to add httpStatus!
}

// Server tries: result.error.httpStatus
// Runtime error: httpStatus is undefined
```

### What Enforces AppError Inheritance?

The doc says "every AppError subclass" but provides no mechanism to enforce this. TypeScript's structural typing means:

```typescript
// This compiles fine — nothing forces Result's error to extend AppError
function foo(): Result<string, { code: string }> { ... }
```

The auto-mapping assumes `result.error.httpStatus` exists, but there's no compile-time guarantee.

### The Hybrid Advocate Already Solved This

The hybrid approach (Model B) has the top-level service throw `AppError`:

```typescript
// Top-level always throws AppError
export async function refundOrder(...): Promise<Refund> {
  const result = await internalRefundOrder(...);
  if (!result.ok) throw result.error; // Error IS an AppError
  return result.value;
}
```

This guarantees the server boundary always receives `AppError`. The Result-first doc doesn't address how it guarantees this.

---

## 4. Hybrid Dismissal — Too Quick

### The Doc's Treatment

> "Model B (internal Result, top-level throw) was rejected as 'boilerplate.'"

The hybrid advocate's key argument:

1. **Internal services** use Result for composition
2. **Top-level service** converts to throw for route handler simplicity
3. **Route handlers** are thin — just call and return

### Why the Dismissal Is Weak

The doc doesn't actually quantify the "boilerplate" cost of hybrid. Let's compare:

**Pure Result at route handler:**
```typescript
route.post('/orders', async (ctx) => {
  const result = await createOrder(ctx.body, ctx);
  return result.match({
    ok: (order) => ctx.json(order, 201),
    err: (error) => ctx.json(error.toJSON(), error.httpStatus),
  });
});
```

**Hybrid at route handler:**
```typescript
route.post('/orders', async (ctx) => {
  const order = await createOrder(ctx.body, ctx); // throws on error
  return ctx.json(order, 201);
});
```

The hybrid route handler is simpler — it's just standard try/catch (or no catch if you let it bubble). The doc says the framework auto-maps, but you still need the `.match()` call.

### The Real Hybrid Advantage

1. **Route handlers stay idiomatic** — Standard TypeScript, no Result understanding required
2. **Service composition still uses Result** — Flat, readable chains
3. **The boundary is explicit** — You know where conversion happens

### The Doc's Counter-Argument

> "Framework auto-maps automatically — for 90% of routes, the developer writes nothing."

This is misleading. The developer must still return the Result:

```typescript
// Still needs explicit handling
const result = await createOrder(ctx.body, ctx);
return result.match({ ... });
```

Unless the doc proposes a wrapper that the route handler NEVER sees the Result. But then:
- How does the developer customize the response?
- How do they add headers?
- How do they handle partial success?

---

## 5. Real-World Comparison — Is Vertz Choosing the Experimental Path?

### The Industry Landscape

As researched:

| Framework | Model | Status |
|-----------|-------|--------|
| **tRPC** | Throw (`TRPCError`) | Production-proven, massive adoption |
| **Remix** | Throw (Response objects) | Production-proven, React Router adopted |
| **Hono** | Throw (`HTTPException`) | Production-proven |
| **Next.js** | Throw | Production-proven |
| **Fastify** | Throw | Production-proven |
| **Vertz (proposed)** | Result + auto-map | Experimental |

### The Question

Vertz is choosing a Result-based approach that NO major production framework uses in TypeScript. The combination of:
1. Service returns Result
2. Framework auto-maps to HTTP
3. No syntactic sugar (like Rust's `?`)

...is experimental. There's no large-scale production proof this works.

### The Doc Should Acknowledge

1. **This is a bet** — We're choosing a pattern less proven than throw
2. **We need to watch for pain points** — If the boilerplate is as bad as critics say, we'll need significant helper utilities
3. **Migration will be hard** — Teams used to throw will resist

---

## 6. Migration Cost — The Breaking Change Nobody Talks About

### The Doc's Treatment

> "Phase 3-5 map to issues #398, #399, #400."

That's it. No quantification of what changes.

### What Actually Changes

**For existing applications:**

```typescript
// BEFORE (current vertz — throwing)
async function createUser(data) {
  const user = await db.users.create(data);
  return user; // or throws on conflict
}

// AFTER (Result-based)
async function createUser(data): Promise<Result<User, UniqueConstraintError>> {
  const result = await db.users.create(data);
  if (!result.ok) return result;
  return ok(result.value);
}
```

**At every layer:**
- Every repository method signature changes
- Every service method signature changes
- Every route handler needs updates
- Tests need rewrites

### The Client Impact

The doc says `@vertz/client` returns Result. This means:

```typescript
// Client code changes from:
const user = await api.getUser(id);
if (!user) showError();

// To:
const result = await api.getUser(id);
if (!result.ok) {
  switch (result.error.code) {
    case 'NOT_FOUND': showNotFound(); break;
    case 'UNAUTHORIZED': redirectToLogin(); break;
  }
}
```

This is a significant DX change for consumers of the client SDK.

### The Honest Assessment

This IS a breaking change. The doc should:
1. **Acknowledge it's a v2.0 change** — As errors-as-values doc suggests
2. **Quantify the migration effort** — Rough LOC estimates
3. **Provide codemods** — Automated migration tooling

---

## 7. Additional Concerns

### 7.1 Error Union Growth

The doc says "if >5 error types, decompose the service." But:

1. **5 is arbitrary** — Why 5 and not 3 or 7?
2. **Decomposition isn't free** — Breaking services apart adds complexity
3. **Real apps have complex operations** — A refund flow that touches orders, inventory, payments, and notifications could easily exceed 5

### 7.2 The "LLM-Friendly" Claim

> "LLM-friendly — an AI agent gets this right on the first prompt"

This is untested. LLMs can generate Result-handling code, but:
- They often forget to check `.ok`
- They sometimes confuse `.value` and `.error`
- The type safety only works if the LLM reads the types

The throw approach might actually be EASIER for LLMs because it's the default JavaScript pattern they're trained on.

### 7.3 No Escape Hatch

What if someone really wants to use try/catch? The doc doesn't provide:
- A `tryCatch` helper to convert throws to Result
- An escape hatch for gradual migration
- Documentation for "when to break the rules"

---

## 8. Verdict

### What the Doc Gets Right

1. **Expected vs. unexpected distinction** — This is the right conceptual model
2. **Type safety as a goal** — Result does provide better compile-time guarantees
3. **Framework auto-mapping** — If it works, this solves the route handler boilerplate

### What Needs Fixing

1. **Acknowledge throw is the industry standard** — Don't dismiss it with a sentence
2. **Quantify the boilerplate cost** — Show real examples with 10+ steps
3. **Commit to helpers day one** — Don't wait "if it proves painful"
4. **Explain the AppError enforcement** — How do you guarantee errors are AppError subclasses?
5. **Address the hybrid criticism properly** — Don't just dismiss, explain why auto-mapping beats the hybrid's throw boundary
6. **Acknowledge experimental choice** — Result-only in TypeScript is not proven at scale
7. **Provide migration details** — Breaking changes need quantification and tooling

### Recommendation

The design is worth exploring, but the doc needs significant revision to address these gaps. The "devil's advocate" concerns are legitimate — if the team proceeds, they should do so with eyes open about the tradeoffs.

---

*Review by Devil's Advocate — finding the holes so the design can improve*
