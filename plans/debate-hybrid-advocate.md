# Position Paper: The Case for a Hybrid Error Handling Model in Vertz

**Author:** Hybrid Approach Advocate  
**Date:** 2026-02-18  
**Status:** Position Paper for Framework Design Debate

---

## Executive Summary

This paper argues that the optimal error handling strategy for vertz is **not** a pure Result-based or pure exception-based approach, but rather a **layer-aware hybrid model**. Specifically, I advocate for **Model B**: internal service functions return `Result` for composition, while the top-level service method that route handlers call throws `AppError`. Route handlers then use a thin helper to map both caught exceptions and returned errors to HTTP responses.

This position is grounded in three principles:
1. **Composability within business logic** — `Result` enables flat, readable service composition
2. **Simplicity at consumption boundaries** — route handlers should be clean, not nested in Result handling
3. **Pragmatism over purity** — the best model is one that developers actually use correctly

---

## 1. Where Result Makes Sense

### 1.1 Internal Service Composition

When building business logic, services call other services in chains. This is where `Result` shines — it enables declarative, flat composition without try/catch pyramids.

```typescript
// @vertz/server/src/services/order-service.ts
import { ok, err, flatMap, map, Result } from '@vertz/errors';
import { db } from '@vertz/db';
import { PaymentError, InventoryError, NotFoundError } from './errors';

export async function refundOrder(
  orderId: string,
  reason: string
): Promise<Result<Refund, PaymentError | InventoryError | NotFoundError>> {
  // Step 1: Fetch order (returns Result)
  const orderResult = await db.orders.findOneRequired(orderId);
  
  // Step 2: Cancel order → returns Result, chains via flatMap
  return flatMap(orderResult, async (order) => {
    if (order.status === 'REFUNDED') {
      return err(new AlreadyRefundedError(orderId));
    }
    
    // Step 3: Process refund (returns Result)
    return flatMap(
      await cancelOrder(order),
      async (cancelledOrder) => {
        // Step 4: Update inventory (returns Result)
        return flatMap(
          await updateInventory(cancelledOrder.items, 'restore'),
          () => ok({ 
            refundId: generateRefundId(),
            orderId,
            amount: cancelledOrder.total,
            reason,
            processedAt: new Date()
          })
        );
      }
    );
  });
}
```

**Why Result here?**
- The `flatMap` chain clearly shows the happy path
- Error types propagate automatically — no manual error wrapping
- Each step's failure short-circuits cleanly without nested try/catch
- Easy to test each function in isolation

### 1.2 Repository and Data Access Layer

The data layer is where `Result` provides the most value — database operations have predictable failure modes that callers need to handle explicitly.

```typescript
// @vertz/db/src/repositories/user-repo.ts
import { ok, err, Result } from '@vertz/errors';
import { 
  UniqueConstraintError, 
  NotFoundError, 
  ConnectionError 
} from '../errors';

export class UserRepository {
  async create(
    input: CreateUserInput
  ): Promise<Result<User, UniqueConstraintError | ValidationError>> {
    const parsed = parseUserSchema(input);
    if (!parsed.ok) {
      return err(new ValidationError(parsed.error.fields));
    }
    
    try {
      const user = await this.db.users.create({
        ...parsed.data,
        createdAt: new Date(),
      });
      return ok(user);
    } catch (e) {
      if (e.code === '23505') { // PostgreSQL unique violation
        return err(new UniqueConstraintError('email', input.email));
      }
      throw e; // Unexpected — let it propagate
    }
  }
  
  async findOneRequired(
    id: string
  ): Promise<Result<User, NotFoundError | ConnectionError>> {
    try {
      const user = await this.db.users.findOne({ id });
      if (!user) {
        return err(new NotFoundError('users', id));
      }
      return ok(user);
    } catch (e) {
      if (e.code === '08006') { // Connection failure
        return err(new ConnectionError(e.message));
      }
      throw e;
    }
  }
}
```

---

## 2. Where Throw Makes Sense

### 2.1 Top-Level Service Boundary

The service method that route handlers call should throw `AppError`. This keeps route handlers simple — they don't need to understand the nuanced error types from deeper in the stack.

```typescript
// @vertz/server/src/services/order-service.ts (continued)

// TOP-LEVEL: This is what route handlers call
export async function refundOrderRoute(
  orderId: string,
  reason: string
): Promise<Refund> {
  const result = await refundOrder(orderId, reason);
  
  if (!result.ok) {
    // Convert Result → AppError throw
    throw result.error; // Error is already an AppError subclass
  }
  
  return result.data;
}

// The internal function returns Result (for composition)
// The wrapper throws (for simple consumption)
```

### 2.2 Unexpected Errors and Infrastructure Failures

Not everything should be a Result. Unexpected errors — bugs, infrastructure failures, out-of-memory — should throw. This is where Model A's philosophy applies: **expected failures return Result, unexpected failures throw**.

```typescript
// Unexpected = developer error or infrastructure failure = throw
function processPayment(paymentIntentId: string): Promise<Payment> {
  // This throws — unexpected programming error
  if (!paymentIntentId) {
    throw new Error('paymentIntentId is required'); // Bug, not business logic
  }
  
  // This returns Result — expected business failure
  return stripe.paymentIntents.capture(paymentIntentId);
}

// When in doubt at the infrastructure layer, throw
// Let the service layer decide whether to convert to Result
```

### 2.3 Framework Boundary (Server → HTTP)

The server boundary should catch unexpected exceptions and convert them to 500 errors. This is where the "server as a whole" handles errors.

```typescript
// @vertz/server/src/adapters/http-adapter.ts
import { AppError } from '@vertz/errors';

export async function httpHandler(
  request: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  try {
    return await handler(request);
  } catch (e) {
    // Expected domain error thrown by service layer
    if (e instanceof AppError) {
      return mapAppErrorToHttp(e);
    }
    
    // Unexpected — infrastructure bug, log and return 500
    console.error('Unexpected error:', e);
    return json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' }, 500);
  }
}

function mapAppErrorToHttp(error: AppError): Response {
  const statusCodes: Record<string, number> = {
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    VALIDATION_ERROR: 400,
    INSUFFICIENT_BALANCE: 422,
    ALREADY_REFUNDED: 409,
    // ...
  };
  
  const status = statusCodes[error.code] ?? 400;
  return json({ code: error.code, message: error.message }, status);
}
```

---

## 3. The Boundary: Where the Transition Happens

The key insight is: **the service layer does the conversion**. Route handlers should not deal with Result at all. This is the "top-level service method" in Model B.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ROUTE HANDLER                            │
│  - Simple: calls service, returns HTTP                         │
│  - Does NOT handle Result                                       │
│  - Catches nothing (exceptions bubble up)                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │ calls
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TOP-LEVEL SERVICE METHOD                      │
│  - Calls internal Result-returning functions                   │
│  - Converts Result → AppError (via throw or explicit error)   │
│  - Returns plain value OR throws AppError                       │
│  - This is the "boundary"                                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │ calls
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                INTERNAL SERVICE FUNCTIONS                       │
│  - Return Result<T, E> for composition                         │
│  - Use flatMap/map for chaining                                 │
│  - Never throw for expected failures                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ calls
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   REPOSITORY / DATA LAYER                       │
│  - Returns Result<T, E>                                         │
│  - Infrastructure errors → throw (unexpected)                  │
│  - Domain errors → Result.Err                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Who Converts?

**The top-level service method converts Result → throw.** Not the route handler, not the repository.

```typescript
// @vertz/server/src/services/order-service.ts

// INTERNAL: Composable, returns Result
async function cancelOrder(order: Order): Promise<Result<Order, CancelError>> {
  // ... returns Result
}

async function updateInventory(
  items: Item[], 
  action: 'restore' | 'deduct'
): Promise<Result<void, InventoryError>> {
  // ... returns Result
}

// TOP-LEVEL: The boundary — converts Result → throw
export async function refundOrder(orderId: string, reason: string): Promise<Refund> {
  const orderResult = await db.orders.findOneRequired(orderId);
  
  if (!orderResult.ok) {
    // Convert to appropriate AppError and THROW
    throw new NotFoundError(orderId, orderResult.error.message);
  }
  
  const cancelResult = await cancelOrder(orderResult.data);
  if (!cancelResult.ok) {
    throw new OrderCancelError(cancelResult.error.message);
  }
  
  const inventoryResult = await updateInventory(cancelResult.data.items, 'restore');
  if (!inventoryResult.ok) {
    throw new InventoryUpdateError(inventoryResult.error.message);
  }
  
  return { 
    refundId: generateId(), 
    orderId, 
    processedAt: new Date() 
  };
}
```

---

## 4. Service Composition in Action

Here's a complete example showing `refundOrder()` → `cancelOrder()` → `updateInventory()` with the hybrid model:

```typescript
// @vertz/server/src/services/order-service.ts
import { ok, err, flatMap, Result, AppError } from '@vertz/errors';

// ─────────────────────────────────────────────────────────────────
// INTERNAL FUNCTIONS: Return Result for composition
// ─────────────────────────────────────────────────────────────────

async function cancelOrder(order: Order): Promise<Result<Order, CancelError>> {
  if (order.status === 'CANCELLED') {
    return err(new AlreadyCancelledError(order.id));
  }
  
  if (order.status === 'REFUNDED') {
    return err(new AlreadyRefundedError(order.id));
  }
  
  try {
    const updated = await db.orders.update(order.id, { 
      status: 'CANCELLED',
      cancelledAt: new Date()
    });
    return ok(updated);
  } catch (e) {
    return err(new CancelError(e.message));
  }
}

async function updateInventory(
  items: OrderItem[],
  action: 'deduct' | 'restore'
): Promise<Result<void, InventoryError>> {
  for (const item of items) {
    const productResult = await db.products.findOne(item.productId);
    
    if (!productResult.ok) {
      return err(new ProductNotFoundError(item.productId));
    }
    
    const product = productResult.data;
    const newQuantity = action === 'deduct' 
      ? product.quantity - item.quantity 
      : product.quantity + item.quantity;
    
    if (newQuantity < 0) {
      return err(new InsufficientStockError(product.name, product.quantity, item.quantity));
    }
    
    await db.products.update(product.id, { quantity: newQuantity });
  }
  
  return ok(undefined);
}

async function processRefund(paymentId: string, amount: number): Promise<Result<RefundId, PaymentError>> {
  const refund = await stripe.refunds.create({
    payment_intent: paymentId,
    amount,
  });
  
  if (refund.status === 'failed') {
    return err(new RefundFailedError(refund.id));
  }
  
  return ok(refund.id);
}

// ─────────────────────────────────────────────────────────────────
// TOP-LEVEL: The boundary — converts Result → throw for route handler
// ─────────────────────────────────────────────────────────────────

export async function refundOrder(
  orderId: string,
  reason: string,
  requestedBy: string
): Promise<Refund> {
  // Step 1: Get order
  const orderResult = await db.orders.findOneRequired(orderId);
  if (!orderResult.ok) {
    throw new NotFoundError(`Order ${orderId} not found`);
  }
  
  const order = orderResult.data;
  
  // Step 2: Verify permission
  if (order.userId !== requestedBy && !isAdmin(requestedBy)) {
    throw new ForbiddenError('You can only refund your own orders');
  }
  
  // Step 3: Cancel order (compose via flatMap)
  const cancelResult = await flatMap(
    ok(order),
    async (o) => cancelOrder(o)
  );
  
  if (!cancelResult.ok) {
    throw mapToAppError(cancelResult.error);
  }
  
  // Step 4: Update inventory
  const inventoryResult = await flatMap(
    ok(cancelResult.data),
    async (cancelledOrder) => updateInventory(cancelledOrder.items, 'restore')
  );
  
  if (!inventoryResult.ok) {
    throw mapToAppError(inventoryResult.error);
  }
  
  // Step 5: Process payment refund
  const refundResult = await flatMap(
    ok(cancelResult.data),
    async (cancelledOrder) => processRefund(cancelledOrder.paymentId, cancelledOrder.total)
  );
  
  if (!refundResult.ok) {
    throw mapToAppError(refundResult.error);
  }
  
  // Success!
  return {
    refundId: refundResult.data,
    orderId,
    amount: cancelResult.data.total,
    reason,
    status: 'COMPLETED',
    processedAt: new Date(),
  };
}

// Helper to map internal errors to AppError
function mapToAppError(error: CancelError | InventoryError | PaymentError): AppError {
  if (error instanceof AlreadyCancelledError) {
    return new AppError<'ALREADY_CANCELLED'>('ALREADY_CANCELLED', error.message);
  }
  if (error instanceof AlreadyRefundedError) {
    return new AppError<'ALREADY_REFUNDED'>('ALREADY_REFUNDED', error.message);
  }
  if (error instanceof InsufficientStockError) {
    return new AppError<'INSUFFICIENT_STOCK'>('INSUFFICIENT_STOCK', error.message);
  }
  // ... other mappings
  return new AppError<'INTERNAL_ERROR'>('INTERNAL_ERROR', error.message);
}
```

---

## 5. Route Handler: Clean Consumption

Route handlers are thin. They call the top-level service method and return HTTP responses. They don't deal with Result — they let exceptions bubble up to the HTTP adapter.

```typescript
// @vertz/server/src/routes/orders.ts
import { json } from '@vertz/server';

async function handleRefundOrder(req: Request): Promise<Response> {
  const { orderId, reason } = await req.json();
  const userId = getCurrentUserId(req);
  
  // Simple: just call the service
  // If it throws AppError, the HTTP adapter catches and maps it
  // If it throws unexpected error, the HTTP adapter catches and returns 500
  const refund = await refundOrder(orderId, reason, userId);
  
  return json({ data: refund }, 200);
}
```

### Alternative: Route Handler with Try/Catch

If you prefer explicit handling at the route level (for custom HTTP mapping), it's still clean:

```typescript
async function handleRefundOrder(req: Request): Promise<Response> {
  const { orderId, reason } = await req.json();
  const userId = getCurrentUserId(req);
  
  try {
    const refund = await refundOrder(orderId, reason, userId);
    return json({ data: refund }, 200);
  } catch (e) {
    if (e instanceof AppError) {
      return mapAppErrorToResponse(e);
    }
    // Unexpected — let server adapter handle it
    throw e;
  }
}
```

---

## 6. Testing Ergonomics

Testing is straightforward with the hybrid model:

### Testing Internal Functions (Return Result)

```typescript
// Testing internal service functions that return Result
describe('cancelOrder', () => {
  it('returns error if order already cancelled', async () => {
    const order = { id: '1', status: 'CANCELLED' };
    const result = await cancelOrder(order);
    
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(AlreadyCancelledError);
  });
  
  it('returns updated order on success', async () => {
    const order = { id: '1', status: 'PENDING' };
    const result = await cancelOrder(order);
    
    expect(result.ok).toBe(true);
    expect(result.data.status).toBe('CANCELLED');
  });
});
```

### Testing Top-Level Service (Throws AppError)

```typescript
// Testing the top-level service function that throws
describe('refundOrder', () => {
  it('throws NotFoundError if order does not exist', async () => {
    // Mock db.orders.findOneRequired to return error
    mockDb.orders.findOneRequired = vi.fn().mockResolvedValue(
      err(new NotFoundError('orders', '999'))
    );
    
    await expect(refundOrder('999', 'requested', 'user-1'))
      .rejects.toThrow(NotFoundError);
  });
  
  it('throws InsufficientStockError if inventory restore fails', async () => {
    mockDb.orders.findOneRequired = vi.fn().mockResolvedValue(ok(order));
    mockDb.products.findOne = vi.fn().mockResolvedValue(
      err(new ProductNotFoundError('prod-1'))
    );
    
    await expect(refundOrder('1', 'no longer needed', 'user-1'))
      .rejects.toThrow(InsufficientStockError);
  });
  
  it('returns refund on success', async () => {
    // Happy path mocks...
    const refund = await refundOrder('1', 'requested', 'user-1');
    
    expect(refund.refundId).toBeDefined();
    expect(refund.status).toBe('COMPLETED');
  });
});
```

### Testing Route Handlers

```typescript
// Route handlers are thin — test the service instead
describe('POST /orders/:id/refund', () => {
  it('returns 404 if order not found', async () => {
    vi.spyOn(orderService, 'refundOrder').mockRejectedValue(
      new NotFoundError('Order not found')
    );
    
    const response = await handler.post('/orders/999/refund', {
      body: { reason: 'requested' },
      userId: 'user-1',
    });
    
    expect(response.status).toBe(404);
  });
  
  it('returns 200 with refund on success', async () => {
    vi.spyOn(orderService, 'refundOrder').mockResolvedValue(refund);
    
    const response = await handler.post('/orders/1/refund', {
      body: { reason: 'requested' },
      userId: 'user-1',
    });
    
    expect(response.status).toBe(200);
    expect(response.json.data.refundId).toBeDefined();
  });
});
```

---

## 7. Comparing the Hybrid Models

### Model A: Services Return Result for Expected, Throw for Unexpected

```typescript
// Services mix Result and throw
async function refundOrder(orderId: string): Promise<Result<Refund, RefundError>> {
  const order = await db.orders.findOne(orderId);
  if (!order) throw new NotFoundError(orderId); // Unexpected-ish
  // ...
}

// Route handler must handle BOTH
async function handler(req) {
  try {
    const result = await refundOrder(req.params.id);
    if (!result.ok) return mapError(result.error);
    return json(result.data);
  } catch (e) {
    // What catches here? Is this expected or unexpected?
    return json({ error: 'INTERNAL' }, 500);
  }
}
```

**Problems:**
- Unclear contract: when does it return Result, when does it throw?
- Route handler must handle both — defeats the purpose
- Hard for LLM to reason about

### Model B: Internal Returns Result, Top-Level Throws ✓

```typescript
// Internal: returns Result
async function cancelOrder(order: Order): Promise<Result<Order, CancelError>> { ... }

// Top-level: converts Result → throw
export async function refundOrder(orderId: string): Promise<Refund> {
  const result = await cancelOrder(order);
  if (!result.ok) throw result.error;
  return result.data;
}

// Route handler: simple, one-liner
async function handler(req) {
  return json(await refundOrder(req.params.id));
}
```

**Advantages:**
- Clear contracts: internal = Result, boundary = throw
- Route handler is simple
- Easy for LLM to understand: "call this, it throws AppError on failure"
- Testable: test internal as Result, test boundary conversion

### Model C: Services Always Return Result, Route Handler Has Helper

```typescript
// Service always returns Result
export async function refundOrder(orderId: string): Promise<Result<Refund, RefundError>> { ... }

// Route handler uses helper
async function handler(req) {
  return resultToHttp(refundOrder(req.params.id));
}
```

**Problems:**
- Route handler must still import and use the helper
- More boilerplate at every route
- No native try/catch experience — feels "different" from standard TS

---

## 8. Why Model B is Best

### 8.1 LLM/AI Agent Experience

When an LLM writes code with vertz, it needs to understand the contract:

> "Call `refundOrder(orderId, reason, userId)`. If it succeeds, you get a `Refund` object. If it fails, it throws an `AppError` with a code you can map to HTTP status."

This is **simple and learnable**. The LLM doesn't need to:
- Check if the function returns Result or throws
- Understand flatMap composition patterns
- Import additional helpers in the route handler

Compare to Model A:
> "This function might return Result or throw. If it returns Result, check ok. If it throws, catch. Good luck figuring out which is which."

Compare to Model C:
> "Call the function, it returns Result. Then wrap it in `resultToHttp()`. Don't forget to import the helper."

**Model B wins for LLM ergonomics.**

### 8.2 Junior Developer Experience

A junior developer learning vertz:

1. **Reads a route handler** — "I call `refundOrder()`, get back data, return JSON"
2. **Reads a service** (if they dive in) — "Oh, it uses Result internally. Neat."
3. **Writes a new service function** — "I should return Result so I can use flatMap"

The mental model is:
- **Route layer**: try/catch (standard TypeScript)
- **Service layer**: Result (composition)
- **Boundary**: conversion happens at the top-level service method

This maps to what they already know (exceptions) while introducing Result where it provides value (composition).

### 8.3 Comparison with Other Frameworks

| Framework | Approach | Notes |
|-----------|----------|-------|
| **Rust/Axum** | Result/Error type | Errors are values by default. The `?` operator is syntactic sugar for flatMap. No exceptions. |
| **Effect-TS** | Either/Effect | Similar to Result. Effects are composed, errors propagate. No exceptions in business logic. |
| **Remix** | Throws for errors | Uses `throw` for errors (redirect, json with status). This is Model A-adjacent but simpler. |
| **tRPC** | Error classes | Errors are typed, thrown, and caught at the boundary. Similar to Model B. |
| **Next.js API** | try/catch | Standard exception handling. No Result pattern. |

Most frameworks that succeed at scale (Rust, Effect-TS, tRPC) either:
1. Use Result everywhere (Rust, Effect-TS) — but they have language support (?, do-notation)
2. Use throws at boundaries with typed errors (tRPC, Remix)

Vertz's Model B is closest to **tRPC** and **Remix** — typed errors thrown at boundaries, with simpler internal composition via Result.

---

## 9. Implementation Recommendations

### 9.1 Create a Boundary Helper

Make it easy to convert Result → throw at the boundary:

```typescript
// @vertz/server/src/helpers/to-result.ts
import { Result, AppError } from '@vertz/errors';

export function toResult<T, E>(
  result: Result<T, E>,
  errorMapper: (e: E) => AppError
): T {
  if (result.ok) {
    return result.data;
  }
  throw errorMapper(result.error);
}

// Or with default mapping (error already extends AppError)
export function toResultOrThrow<T, E extends AppError>(result: Result<T, E>): T {
  if (result.ok) {
    return result.data;
  }
  throw result.error;
}
```

### 9.2 Document the Layer Contract

```typescript
/**
 * Refunds an order.
 * 
 * @throws NotFoundError - Order does not exist
 * @throws ForbiddenError - User cannot refund this order  
 * @throws InsufficientStockError - Cannot restore inventory
 * @throws OrderCancelError - Order could not be cancelled
 */
export async function refundOrder(
  orderId: string,
  reason: string,
  userId: string
): Promise<Refund> { ... }
```

### 9.3 HTTP Adapter Handles the Rest

```typescript
// @vertz/server/src/adapters/http.ts
export async function adapt(
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof AppError) {
      return mapAppErrorToResponse(e);
    }
    // Log unexpected errors, return 500
    console.error('Unexpected:', e);
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
}
```

---

## 10. Conclusion

The hybrid model (Model B) provides the best balance of:

1. **Composability** — Internal services use Result for flat, readable composition
2. **Simplicity** — Route handlers are thin, using standard try/catch
3. **Clarity** — The boundary is explicit: internal = Result, top-level = throw
4. **Learnability** — LLMs and junior developers can quickly understand the contract
5. **Pragmatism** — It works with TypeScript's native exception handling while introducing Result where it adds value

The key insight is that **not every layer needs the same error handling strategy**. Use Result where you're composing functions (services, repositories). Use throws where you're exposing to consumers (top-level services, route handlers). Convert at the boundary.

This is not about choosing between Result or exceptions — it's about using the right tool at each layer.

---

## Appendix: Quick Reference

| Layer | Returns | Throws | Notes |
|-------|---------|--------|-------|
| Repository | `Result<T, E>` | Infrastructure errors | Expected failures = Result |
| Internal Service | `Result<T, E>` | Never | For composition via flatMap |
| Top-Level Service | `T` | `AppError` | Boundary: converts Result → throw |
| Route Handler | `Response` | Lets exceptions bubble | Simple try/catch or none |
| HTTP Adapter | `Response` | Catches all | Maps AppError → HTTP, catches unexpected → 500 |

---

*This position paper advocates for Model B as the recommended hybrid approach for vertz.*
