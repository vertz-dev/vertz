# Position Paper: Throw-by-Default for Services in Vertz

**Author:** Throw Advocate  
**Topic:** Service error handling strategy  
**Context:** `@vertz/errors` provides `Result<T, E>`, `ok()`, `err()`, and `AppError` classes

---

## Executive Summary

We should adopt **throw-by-default** for services: services throw `AppError` subclasses, and the server boundary catches them and maps to HTTP responses. While `Result<T, E>` has its place, the throwing model provides superior developer experience for the service layer.

---

## 1. Simple Service: `createUser(data)`

### The Throw Approach

```typescript
// errors/user-errors.ts
export class ValidationError extends AppError {
  constructor(message: string, fields: string[] = []) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
  }
}

export class UserConflictError extends AppError {
  constructor(email: string) {
    super(`User with email ${email} already exists`, 'USER_CONFLICT', 409);
  }
}

// services/user-service.ts
export class UserService {
  constructor(private db: Database) {}

  async createUser(data: CreateUserDto): Promise<User> {
    // Validation - throw early
    if (!data.email.includes('@')) {
      throw new ValidationError('Invalid email format', ['email']);
    }
    if (!data.password || data.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters', ['password']);
    }

    // Business logic - check conflict
    const existing = await this.db.users.findByEmail(data.email);
    if (existing) {
      throw new UserConflictError(data.email);
    }

    // Success path is clean - no wrapping, no Result type
    const user = await this.db.users.create({
      email: data.email,
      name: data.name,
    });

    return user;
  }
}
```

### The Result Approach (for comparison)

```typescript
// With Result<T, E>, every caller must unwrap
async function createUser(data: CreateUserDto): Promise<Result<User, ValidationError | UserConflictError>> {
  if (!data.email.includes('@')) {
    return err(new ValidationError('Invalid email', ['email']));
  }
  
  const existing = await this.db.users.findByEmail(data.email);
  if (existing) {
    return err(new UserConflictError(data.email));
  }
  
  const user = await this.db.users.create(data);
  return ok(user);
}

// Caller must handle both paths explicitly
const result = await userService.createUser(data);
if (result.isErr()) {
  // Do something with error
  return;
}
const user = result.value;
// Use user...
```

### Why Throw Wins Here

- **Cleaner happy path**: No `result.isErr()` checks polluting the success flow
- **Familiar mental model**: Every JS developer understands try/catch
- **Early returns**: Validation errors exit immediately via throw, no nested error accumulation

---

## 2. Service Composition: `refundOrder()`

This is where the rubber meets the road. Let's trace a real scenario.

```typescript
// errors/order-errors.ts
export class OrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, 'ORDER_NOT_FOUND', 404);
  }
}

export class OrderAlreadyRefundedError extends AppError {
  constructor(orderId: string) {
    super(`Order ${orderId} already refunded`, 'ALREADY_REFUNDED', 400);
  }
}

export class InsufficientInventoryError extends AppError {
  constructor(sku: string) {
    super(`Insufficient inventory for ${sku}`, 'INSUFFICIENT_INVENTORY', 400);
  }
}

export class PaymentFailedError extends AppError {
  constructor(reason: string) {
    super(`Payment failed: ${reason}`, 'PAYMENT_FAILED', 500);
  }
}

// services/order-service.ts
export class OrderService {
  constructor(
    private orderDb: OrderDatabase,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
  ) {}

  async refundOrder(orderId: string, reason: string): Promise<Refund> {
    // Step 1: Get order (throws if not found)
    const order = await this.orderDb.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    // Step 2: Check already refunded
    if (order.status === 'refunded') {
      throw new OrderAlreadyRefundedError(orderId);
    }

    // Step 3: Cancel order (may throw InventoryError)
    await this.cancelOrder(order);

    // Step 4: Process refund (may throw PaymentError)
    await this.paymentService.refund(order.paymentId, order.amount);

    // Step 5: Create refund record
    const refund = await this.orderDb.refunds.create({
      orderId,
      reason,
      amount: order.amount,
    });

    return refund;
  }

  private async cancelOrder(order: Order): Promise<void> {
    // This calls updateInventory - errors bubble up naturally
    for (const item of order.items) {
      await this.inventoryService.returnInventory(item.sku, item.quantity);
    }
    
    await this.orderDb.update(order.id, { status: 'refunded' });
  }
}
```

### How Errors Compose

```typescript
// The caller's experience - errors bubble naturally
app.post('/orders/:orderId/refund', async (req, res) => {
  try {
    const refund = await orderService.refundOrder(req.params.orderId, req.body.reason);
    res.json(refund);
  } catch (e) {
    // Errors from ANY layer in the composition bubble up
    if (e instanceof InsufficientInventoryError) {
      res.status(400).json({ error: e.message, code: e.code });
    } else if (e instanceof OrderNotFoundError) {
      res.status(404).json({ error: e.message, code: e.code });
    } else if (e instanceof PaymentFailedError) {
      res.status(500).json({ error: e.message, code: e.code });
    } else {
      throw e; // Re-throw unexpected errors
    }
  }
});
```

### The Result Alternative Gets Ugly

```typescript
// With Result, you'd need to compose error types
type RefundError = 
  | OrderNotFoundError 
  | OrderAlreadyRefundedError 
  | InsufficientInventoryError 
  | PaymentFailedError;

async function refundOrder(orderId: string): Promise<Result<Refund, RefundError>> {
  const orderResult = await this.orderDb.findById(orderId);
  if (orderResult.isErr()) return orderResult; // propagate
  
  const order = orderResult.value;
  if (order.status === 'refunded') {
    return err(new OrderAlreadyRefundedError(orderId));
  }

  const cancelResult = await this.cancelOrder(order);
  if (cancelResult.isErr()) return cancelResult; // propagate

  const refundResult = await this.paymentService.refund(order.paymentId);
  if (refundResult.isErr()) return refundResult; // propagate

  return ok(refund);
}

// Every. Single. Call. Needs. Unwrapping.
```

---

## 3. Route Handler: The Server Boundary

The key insight: **the throw model isolates error handling to one place** — the HTTP boundary.

```typescript
// routes/users.ts
export const userRoutes = (service: UserService) => [
  {
    method: 'POST',
    path: '/users',
    handler: async (req, res) => {
      // Services throw - we don't handle errors here
      const user = await service.createUser(req.body);
      res.status(201).json(user);
    },
  },
];

// server.ts - THE BOUNDARY
class Server {
  private errors = {
    VALIDATION: 400,
    USER_CONFLICT: 409,
    ORDER_NOT_FOUND: 404,
    INSUFFICIENT_INVENTORY: 400,
    PAYMENT_FAILED: 500,
  };

  async handle(route: Route, req: Request): Promise<Response> {
    try {
      return await route.handler(req, this);
    } catch (e) {
      if (e instanceof AppError) {
        const status = this.errors[e.code] || 500;
        return Response.json(
          { error: e.message, code: e.code, details: e.details },
          { status }
        );
      }
      
      // Unexpected error - log and hide from client
      console.error('Unexpected error:', e);
      return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
}
```

### One Catch Block to Rule Them All

```typescript
// Your entire error handling strategy in one place
app.use(async (ctx) => {
  try {
    const handler = findHandler(ctx.request);
    const result = await handler(ctx);
    return result;
  } catch (e) {
    if (e instanceof AppError) {
      return mapToHttpResponse(e);
    }
    
    // Infrastructure errors (connection failures, timeouts)
    // These are already thrown by the runtime - we just handle them
    if (e instanceof MongoError || e instanceof PostgresError) {
      log.error('Database error', e);
      return new Response('Internal error', { status: 500 });
    }
    
    throw e; // Let middleware handle
  }
});
```

---

## 4. Error Propagation: Bubbling and Wrapping

### Natural Bubbling

```typescript
// Errors propagate automatically up the call stack
async function complexOperation() {
  // This might throw InsufficientInventoryError
  await inventoryService.reserve('SKU-123', 5);
  
  // This might throw PaymentFailedError  
  await paymentService.charge('cust_123', Money.usd(99.00));
  
  // If either throws, the function exits immediately
  // No need to manually propagate
}

// Caller can catch at the right level
try {
  await complexOperation();
} catch (e) {
  if (e instanceof InsufficientInventoryError) {
    // Handle inventory specifically
    return { available: await inventoryService.getStock('SKU-123') };
  }
  throw e; // Let others bubble
}
```

### When to Wrap Errors

```typescript
// Wrap when crossing a boundary to add context
async function refundOrderWithLogging(orderId: string): Promise<Refund> {
  try {
    return await orderService.refundOrder(orderId, 'customer request');
  } catch (e) {
    // Add context without losing the original error
    throw new AppError(
      `Failed to refund order ${orderId}`,
      'REFUND_FAILED',
      500,
      { originalError: e.message }
    );
  }
}
```

### Re-throwing with Context

```typescript
// Sometimes you want to catch, handle, then re-throw
async function createOrderWithRetry(data: OrderData): Promise<Order> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await orderService.create(data);
    } catch (e) {
      if (e instanceof PaymentFailedError && attempt < 3) {
        console.log(`Payment failed, retrying (${attempt}/3)...`);
        await sleep(1000 * attempt);
        continue;
      }
      throw e; // Re-throw if not retryable or out of retries
    }
  }
  throw new Error('Unreachable');
}
```

---

## 5. Testing Ergonomics

### Testing Throwing Services

```typescript
// services/__tests__/user-service.test.ts
describe('UserService', () => {
  let service: UserService;
  let mockDb: jest.Mocked<UserDatabase>;

  beforeEach(() => {
    mockDb = { findByEmail: jest.fn(), create: jest.fn() };
    service = new UserService(mockDb);
  });

  describe('createUser', () => {
    it('throws ValidationError for invalid email', async () => {
      const invalidData = { email: 'invalid', password: 'password123' };
      
      await expect(service.createUser(invalidData))
        .rejects
        .toThrow(ValidationError);
    });

    it('throws UserConflictError when email exists', async () => {
      mockDb.findByEmail.mockResolvedValue({ id: 'existing', email: 'test@test.com' });
      
      await expect(service.createUser({ email: 'test@test.com', password: 'password123' }))
        .rejects
        .toThrow(UserConflictError);
    });

    it('returns user on success', async () => {
      mockDb.findByEmail.mockResolvedValue(null);
      mockDb.create.mockResolvedValue({ id: 'new', email: 'new@test.com' });
      
      const user = await service.createUser({ email: 'new@test.com', password: 'password123' });
      
      expect(user.id).toBe('new');
    });

    it('throws correct error with correct status code', async () => {
      try {
        await service.createUser({ email: 'bad', password: 'short' });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.statusCode).toBe(400);
        expect(e.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
```

### The Testing Story

```typescript
// Clear, readable test names
it('throws InsufficientInventoryError when not enough stock', async () => { });
it('throws OrderNotFoundError for unknown order', async () => { });
it('throws PaymentFailedError when stripe fails', async () => { });

// One-liner to verify behavior
await expect(service.createUser(data)).rejects.toThrow(ValidationError);
```

---

## The Downsides: An Honest Assessment

### 1. Lost Type Safety

```typescript
// TypeScript doesn't know what createUser can throw
async function createUser(data: CreateUserDto): Promise<User> {
  // ...
}

// Caller has NO type-level knowledge of possible errors
const user = await createUser(data); // What can go wrong? Who knows!
```

**Mitigation strategies:**

```typescript
// Strategy 1: JSDoc (imperfect but works)
/**
 * @throws {ValidationError}
 * @throws {UserConflictError}
 */
async function createUser(data: CreateUserDto): Promise<User>

// Strategy 2: Error catalog in documentation
// /docs/errors.md lists all errors per service

// Strategy 3: Type-safe wrapper for callers who want it
type SafeResult<T> = { success: true; data: T } | { success: false; error: AppError };
async function safe<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
  try { return { success: true, data: await fn() }; }
  catch (e) { return { success: false, error: e as AppError }; }
}
```

### 2. Try/Catch Nesting

```typescript
// Composition can get nested (but this is rare in practice)
try {
  try {
    await cancelOrder(orderId);
  } catch (e) {
    if (e instanceof InventoryError) {
      // Handle inventory-specific
    }
    throw e;
  }
  await processRefund(orderId);
} catch (e) {
  // Top-level handling
}
```

**Reality check:** This nesting is uncommon. Most services either succeed or fail at one specific point. The "call one service, catch at boundary" pattern covers 90% of use cases.

### 3. Invisible Control Flow

```typescript
// You can't tell by looking at the signature what can throw
async function createUser(data: CreateUserDto): Promise<User>

// You'd need to read the implementation to know:
// - ValidationError (invalid input)
// - UserConflictError (email taken)  
// - DatabaseError (connection failed)
// - etc.
```

**This is valid.** It's the same "problem" as JavaScript's runtime errors, Node's callback errors, or Promise rejections. We accept this invisible control flow everywhere else in JavaScript.

### 4. "How Do I Know What Errors a Service Throws?"

```typescript
// Without reading implementation, you don't know.
// But honestly, did you ever really read every function you call?

// You probably:
// 1. Read the docs
// 2. Called it and saw what happened
// 3. Debugged when it failed

// The same applies here.
```

---

## Why Throw is STILL Better

### 1. Familiar to Every JS/TS Developer

```typescript
// This is JavaScript 101
try {
  const user = await service.createUser(data);
  // happy path
} catch (e) {
  // error path
}

// Result requires learning a new paradigm
const result = await service.createUser(data);
if (result.isErr()) { /* error path */ }
// vs
if (result.isOk()) { /* happy path */ }
```

No onboarding required. Every junior developer understands throws.

### 2. Less Boilerplate

```typescript
// Throw: just call and use
const user = await userService.createUser(data);
sendWelcomeEmail(user);

// Result: 2x the code
const result = await userService.createUser(data);
if (result.isErr()) {
  return handleError(result.error);
}
const user = result.value;
sendWelcomeEmail(user);
```

### 3. Happy Path is Clean

```typescript
// Services return the thing you want
async function processOrder(id: string): Promise<Order> {
  const order = await findOrder(id);
  const confirmed = await confirmPayment(order);
  const shipped = await shipOrder(confirmed);
  return shipped;
}

// No Result types cluttering the logic
// No nested unwrapping
// Just the domain logic
```

### 4. Infrastructure Errors Already Throw

```typescript
// The world already throws:
await db.query('SELECT *');        // throws on connection failure
await fetch('/api');               // throws on network error  
await file.read();                 // throws on I/O error
await redis.get('key');            // throws on timeout

// If we use Result for domain errors but throws for infrastructure,
// we have TWO error handling models:

async function createUser(data: CreateUserDto): Promise<Result<User, DomainError>> {
  // Domain errors are Results...
  if (!valid(data)) return err(new ValidationError());
  
  // But infrastructure throws!
  const user = await db.create(data); // throws DatabaseError
  
  return ok(user);
}

// Now callers must handle BOTH patterns
const result = await createUser(data);
if (result.isErr()) { /* handle domain error */ }
// But what about the DatabaseError? It threw! Catch it separately.

try {
  const result = await createUser(data);
} catch (e) {
  if (e instanceof DatabaseError) { /* infrastructure error */ }
}

// Having ONE model (throw) is simpler
```

---

## Conclusion

The throw-by-default model wins because:

1. **Simplicity**: One error handling model at the boundary, not two
2. **Productivity**: Less boilerplate, cleaner happy paths
3. **Familiarity**: No learning curve for the entire JS ecosystem
4. **Composition**: Errors bubble naturally through service layers
5. **Testing**: Standard `expect().rejects.toThrow()` works everywhere

The downsides (lost type safety, invisible control flow) are real but manageable. They're the same trade-offs we've accepted for runtime errors throughout JavaScript's history.

**Recommendation:** Adopt throw-by-default for services. Use `Result<T, E>` only at the boundaries where you need explicit control (like form validation where you want ALL errors at once).

---

*This position paper advocates for throw-by-default. A companion paper should present the Result-first counter-argument for balanced discussion.*
