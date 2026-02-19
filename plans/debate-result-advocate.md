# Position Paper: Services Should Return `Result<T, E>`

**Advocate:** Result-everywhere  
**Framework:** vertz (TypeScript)  
**Topic:** Service layer error handling design

---

## Executive Summary

We recommend that **all services return `Result<T, E>`** rather than throwing exceptions. This creates a predictable, composable, and testable error handling flow from the service layer through route handlers to HTTP responses.

---

## 1. Simple Service: `createUser(data)`

Services should return `Result<T, E>` where `E` is a discriminated union of all possible failure modes.

```typescript
// @vertz/errors types (assumed)
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error: E };
}

// Error types for this service
type ValidationError = 
  | { type: 'invalid_email'; message: string }
  | { type: 'weak_password'; message: string }
  | { type: 'missing_field'; field: string };

type ConflictError = { type: 'email_already_exists'; email: string };

type CreateUserError = ValidationError | ConflictError;

// Service returns Result
async function createUser(data: {
  email: string;
  password: string;
  name: string;
}): Promise<Result<User, CreateUserError>> {
  // Validation
  if (!isValidEmail(data.email)) {
    return err({ type: 'invalid_email', message: 'Invalid email format' });
  }

  if (!isStrongPassword(data.password)) {
    return err({ type: 'weak_password', message: 'Password too weak' });
  }

  if (!data.name?.trim()) {
    return err({ type: 'missing_field', field: 'name' });
  }

  // Check conflict
  const existing = await userRepository.findByEmail(data.email);
  if (existing) {
    return err({ type: 'email_already_exists', email: data.email });
  }

  // Success
  const user = await userRepository.create(data);
  return ok(user);
}
```

**Why this works:**
- Every failure mode is explicit in the type signature
- Callers **must** handle both success and failure
- No hidden exceptions flying up the stack

---

## 2. Service Composition: `refundOrder()`

When services call other services, Results compose naturally with `map`, `andThen`, and `mapError`.

```typescript
// Assume these services exist
type UpdateInventoryError = 
  | { type: 'product_not_found'; sku: string }
  | { type: 'insufficient_stock'; sku: string; available: number; requested: number };

type CancelOrderError = 
  | { type: 'order_not_found'; orderId: string }
  | { type: 'already_shipped'; orderId: string }
  | { type: 'inventory_failed'; error: UpdateInventoryError };

type RefundOrderError = 
  | CancelOrderError
  | { type: 'payment_failed'; reason: string }
  | { type: 'refund_already_processed'; orderId: string };

async function updateInventory(sku: string, delta: number): Promise<Result<void, UpdateInventoryError>> {
  const product = await productRepository.findBySku(sku);
  if (!product) {
    return err({ type: 'product_not_found', sku });
  }
  if (product.stock + delta < 0) {
    return err({ 
      type: 'insufficient_stock', 
      sku, 
      available: product.stock, 
      requested: -delta 
    });
  }
  await productRepository.updateStock(sku, delta);
  return ok(undefined);
}

async function cancelOrder(orderId: string): Promise<Result<Order, CancelOrderError>> {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    return err({ type: 'order_not_found', orderId });
  }
  if (order.status === 'shipped') {
    return err({ type: 'already_shipped', orderId });
  }

  // Compose with updateInventory - note the nested error mapping
  const inventoryResult = await updateInventory(order.sku, order.quantity);
  if (!inventoryResult.ok) {
    return err({ type: 'inventory_failed', error: inventoryResult.error });
  }

  order.status = 'cancelled';
  await orderRepository.save(order);
  return ok(order);
}

async function refundOrder(orderId: string, amount: number): Promise<Result<Refund, RefundOrderError>> {
  // First cancel the order
  const cancelResult = await cancelOrder(orderId);
  
  if (!cancelResult.ok) {
    // Propagate CancelOrderError up as RefundOrderError
    return err(cancelResult.error);
  }

  // Check if already refunded
  if (cancelResult.value.refundStatus === 'refunded') {
    return err({ type: 'refund_already_processed', orderId });
  }

  // Process payment refund
  const refundResult = await paymentGateway.refund(amount);
  if (!refundResult.ok) {
    return err({ type: 'payment_failed', reason: refundResult.error.message });
  }

  return ok(refundResult.value);
}
```

### Composition Utilities (helper functions)

```typescript
// Generic Result combinators for cleaner composition
async function andThen<T, E, U, F>(
  result: Promise<Result<T, E>>,
  fn: (value: T) => Promise<Result<U, F>>
): Promise<Result<U, E | F>> {
  const r = await result;
  if (!r.ok) return err(r.error);
  return fn(r.value);
}

function mapError<E, F>(result: Result<unknown, E>, fn: (e: E) => F): Result<unknown, F> {
  if (result.ok) return result;
  return err(fn(result.error));
}
```

**Key insight:** Error types naturally accumulate through composition, but each layer only knows about its own errors plus the errors from direct dependencies.

---

## 3. Route Handler: Translating Result → HTTP Response

The route handler's job is simple: consume the `Result` and produce an HTTP response with appropriate status codes.

```typescript
// HTTP status mapping
function errorToStatus(error: CreateUserError): number {
  switch (error.type) {
    case 'invalid_email':
    case 'weak_password':
    case 'missing_field':
      return 400; // Bad Request
    case 'email_already_exists':
      return 409; // Conflict
  }
}

function errorToResponse(error: CreateUserError): object {
  switch (error.type) {
    case 'invalid_email':
      return { error: 'VALIDATION_ERROR', message: error.message };
    case 'weak_password':
      return { error: 'WEAK_PASSWORD', message: error.message };
    case 'missing_field':
      return { error: 'MISSING_FIELD', field: error.field };
    case 'email_already_exists':
      return { error: 'EMAIL_EXISTS', email: error.email };
  }
}

// Route handler
app.post('/users', async (req, res) => {
  const result = await createUser(req.body);
  
  if (result.ok) {
    return res.status(201).json(result.value);
  }
  
  const status = errorToStatus(result.error);
  return res.status(status).json(errorToResponse(result.error));
});
```

### Generalized Handler Helper

```typescript
type HttpError = { status: number; code: string; message?: string; details?: unknown };

function handleResult<T, E>(
  result: Result<T, E>,
  errorMapper: (e: E) => HttpError
): { status: number; body: T | HttpError } {
  if (result.ok) {
    return { status: 200, body: result.value };
  }
  const httpError = errorMapper(result.error);
  return { status: httpError.status, body: httpError };
}

// Cleaner route handler
app.post('/users', async (req, res) => {
  const result = await createUser(req.body);
  const { status, body } = handleResult(result, (error) => {
    switch (error.type) {
      case 'invalid_email':
        return { status: 400, code: 'INVALID_EMAIL', message: error.message };
      case 'weak_password':
        return { status: 400, code: 'WEAK_PASSWORD', message: error.message };
      case 'missing_field':
        return { status: 400, code: 'MISSING_FIELD', field: error.field };
      case 'email_already_exists':
        return { status: 409, code: 'EMAIL_EXISTS', email: error.email };
    }
  });
  res.status(status).json(body);
});
```

---

## 4. Error Type Accumulation: Is It a Problem?

### The Concern

As services compose, the error union grows:

```
refundOrderError = 
  | CancelOrderError
  | UpdateInventoryError  
  | PaymentError
  | RefundAlreadyProcessedError
```

In deep call stacks, this can become unwieldy.

### Why It's Actually Fine

1. **Local reasoning:** Each function only deals with its direct errors + errors from immediate dependencies
2. **Discriminated unions:** TypeScript narrows types with `switch`/`if`
3. **Error collapsing:** At the route handler level, you map to generic HTTP errors anyway

### Strategies for Managing Growth

**Option A: Error Collapsing at Boundaries**

```typescript
// At service boundary - collapse to generic errors
type ServiceError = 
  | { type: 'validation'; errors: ValidationError[] }
  | { type: 'conflict'; resource: string; id: string }
  | { type: 'not_found'; resource: string; id: string }
  | { type: 'internal'; message: string };

function toServiceError<E>(error: E): ServiceError {
  // Map specific errors to generic ones
  if ('type' in error && error.type === 'invalid_email') {
    return { type: 'validation', errors: [error] };
  }
  return { type: 'internal', message: String(error) };
}
```

**Option B: Error Modules Per Aggregate**

```typescript
// errors/order.ts - all order-related errors in one module
export type OrderError = 
  | OrderNotFoundError
  | OrderAlreadyShippedError
  | InventoryError
  | PaymentError;

// errors/payment.ts
export type PaymentError = 
  | PaymentDeclinedError
  | PaymentGatewayError;
```

**Option C: Contextual Error Wrapping**

```typescript
type ContextError<T> = { context: string; error: T };

function withContext<T, E>(result: Result<T, E>, context: string): Result<T, ContextError<E>> {
  if (result.ok) return result;
  return err({ context, error: result.error });
}
```

### Verdict

Error accumulation is manageable with discriminated unions and thoughtful error organization. The alternative (uncaught exceptions) is far worse.

---

## 5. Testing Ergonomics

Testing Result-returning services is straightforward and often cleaner than testing throw-based code.

```typescript
// ✅ Test success case
describe('createUser', () => {
  it('creates user successfully', async () => {
    const result = await createUser({
      email: 'test@example.com',
      password: 'securepass123',
      name: 'Test User'
    });
    
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      email: 'test@example.com',
      name: 'Test User'
    });
  });

  it('fails with weak password', async () => {
    const result = await createUser({
      email: 'test@example.com',
      password: '123',
      name: 'Test'
    });
    
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe('weak_password');
    expect(result.error.message).toBe('Password too weak');
  });

  it('fails with duplicate email', async () => {
    // Arrange
    await userRepository.create({ email: 'test@example.com', ... });
    
    // Act
    const result = await createUser({
      email: 'test@example.com',
      password: 'securepass123',
      name: 'Test'
    });
    
    // Assert
    expect(result.ok).toBe(false);
    expect(result.error.type).toBe('email_already_exists');
    expect(result.error.email).toBe('test@example.com');
  });
});
```

### Testing Composed Services

```typescript
describe('refundOrder', () => {
  it('cancels order, updates inventory, and processes refund', async () => {
    // Mock dependencies
    orderRepository.findById.mockResolvedValue({ 
      id: 'order-1', 
      sku: 'SKU123', 
      quantity: 2,
      status: 'pending'
    });
    productRepository.findBySku.mockResolvedValue({ 
      sku: 'SKU123', 
      stock: 10 
    });
    paymentGateway.refund.mockResolvedValue(ok({ refundId: 'refund-1' }));

    const result = await refundOrder('order-1', 50);

    expect(result.ok).toBe(true);
    expect(result.value.refundId).toBe('refund-1');
    expect(productRepository.updateStock).toHaveBeenCalledWith('SKU123', -2);
  });

  it('fails when order already shipped', async () => {
    orderRepository.findById.mockResolvedValue({ 
      id: 'order-1', 
      status: 'shipped' 
    });

    const result = await refundOrder('order-1', 50);

    expect(result.ok).toBe(false);
    expect(result.error.type).toBe('already_shipped');
  });
});
```

### Matcher Helpers (Optional)

```typescript
// Custom matchers for nicer tests
expect(result).toBeOk();
expect(result).toBeErr();
expect(result).toHaveErrorType('email_already_exists');
expect(result).toHaveValueMatching({ email: 'test@example.com' });
```

---

## Addressing the Downsides

### 1. Verbosity vs Try/Catch

**The claim:** `Result` is more verbose than `try/catch`.

**Reality:** 

```typescript
// ❌ try/catch approach
async function createUserHandler(req, res) {
  try {
    const user = await createUser(req.body);  // What errors can this throw?
    res.status(201).json(user);
  } catch (e) {
    // What happened? Network error? Validation? DB failure?
    // Need to inspect 'e' to know - no type safety
    if (e.code === '23505') { // PostgreSQL duplicate key
      res.status(409).json({ error: 'email_exists' });
    } else if (e.name === 'ValidationError') {
      res.status(400).json({ error: e.message });
    } else {
      res.status(500).json({ error: 'internal' });
      console.error(e); // What was e?
    }
  }
}

// ✅ Result approach - explicit, type-safe, no exceptions to catch
async function createUserHandler(req, res) {
  const result = await createUser(req.body);
  if (result.ok) {
    return res.status(201).json(result.value);
  }
  // TypeScript knows exactly what errors are possible
  // No catching unknown exceptions
}
```

The "verbosity" is upfront in defining error types. Once defined, handling is clear and exhaustive. With try/catch, you **don't know** what might be caught - that's hidden information.

### 2. Learning Curve for Developers Used to Throwing

This is a fair concern. Developers familiar with Java/C#/Python expect exceptions.

**Mitigation:**

1. **Migration path:** Allow both in the same codebase initially
2. **TypeScript makes it learnable:** The compiler guides developers through pattern matching
3. **Result is just data:** No special control flow - just checking `{ ok: true/false }`
4. **Utilities help:** `andThen()`, `map()`, `fromTry()` helpers smooth the path

```typescript
// Bridge: Convert sync try/catch to Result
function tryCatch<T, E>(fn: () => T, mapError: (e: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (e) {
    return err(mapError(e));
  }
}

// Bridge: Convert async try/catch to Result  
async function tryCatchAsync<T, E>(
  fn: () => Promise<T>,
  mapError: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(mapError(e));
  }
}
```

### 3. Infrastructure Errors (DB Down, Network Timeout)

**Question:** Should infrastructure errors go in `Result` too?

**Answer:** Yes. All errors should be explicit.

```typescript
type InfrastructureError = 
  | { type: 'database_unavailable'; connectionString: string }
  | { type: 'network_timeout'; service: string; ms: number }
  | { type: 'external_service_error'; service: string; status: number };

type ServiceError = ApplicationError | InfrastructureError;

// Service explicitly handles infrastructure failures
async function createUser(data: UserData): Promise<Result<User, ServiceError>> {
  try {
    // Database operation
    const user = await userRepository.create(data);
    return ok(user);
  } catch (e) {
    if (e instanceof ConnectionError) {
      return err({ type: 'database_unavailable', connectionString: '...' });
    }
    if (e instanceof TimeoutError) {
      return err({ type: 'network_timeout', service: 'db', ms: e.timeout });
    }
    // Unknown error - escalate as internal
    return err({ type: 'internal', cause: e });
  }
}
```

**Why include infrastructure in Result:**

1. Route handlers need to know **how** to respond (503 vs 500 vs 409)
2. Tests can verify infrastructure failure handling
3. Observability systems can track infrastructure vs application errors differently
4. Clients can retry 503s but not 400s

---

## Conclusion

**Services should return `Result<T, E>`. Always.**

Benefits:
- **Explicit error handling** - no hidden exceptions
- **Type safety** - compiler enforces error handling
- **Composable** - Results chain naturally through services
- **Testable** - straightforward unit testing without exception mocking
- **Predictable** - route handlers know exactly what to expect

The upfront cost of defining error types pays dividends in maintainability, debuggability, and developer experience.

---

*Position paper author: Result-everywhere advocate*  
*Framework: vertz (TypeScript)*
