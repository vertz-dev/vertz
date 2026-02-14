# @vertz/testing

Test utilities for Vertz applications. Write fast, isolated tests for your routes, services, and business logic.

## Installation

```bash
npm install --save-dev @vertz/testing
```

This package provides test helpers that work seamlessly with Vitest (recommended) or any other test framework.

## Quick Start

### Testing a Route

```ts
import { createTestApp } from '@vertz/testing';
import { UserModule } from './modules/users/user.module';
import { describe, expect, it } from 'vitest';

describe('User routes', () => {
  it('returns list of users', async () => {
    const app = createTestApp().register(UserModule);
    
    const res = await app.get('/users');
    
    expect(res.ok).toBe(true);
    expect(res.body).toEqual({
      users: expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String) }),
      ]),
    });
  });
  
  it('creates a new user', async () => {
    const app = createTestApp().register(UserModule);
    
    const res = await app.post('/users', {
      body: { name: 'Jane Doe', email: 'jane@example.com' },
    });
    
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: 'Jane Doe',
    });
  });
});
```

### Testing a Service

```ts
import { createTestService } from '@vertz/testing';
import { UserService, DatabaseService } from './services';
import { describe, expect, it } from 'vitest';

describe('UserService', () => {
  it('finds user by ID', async () => {
    const userService = await createTestService(UserService)
      .mock(DatabaseService, {
        query: () => Promise.resolve([{ id: '1', name: 'Jane' }]),
      });
    
    const user = await userService.findById('1');
    
    expect(user).toEqual({ id: '1', name: 'Jane' });
  });
});
```

## API Reference

### `createTestApp()`

Creates a test application builder for integration testing routes and modules.

```ts
import { createTestApp } from '@vertz/testing';

const app = createTestApp();
```

Returns a `TestApp` instance with the following methods:

#### `app.register(module, options?)`

Register a module with optional configuration.

```ts
app.register(UserModule);
app.register(UserModule, { apiKey: 'test-key' });
```

**Parameters:**
- `module` — A Vertz module created with `createModule()`
- `options` — Optional configuration passed to the module

**Returns:** `TestApp` (chainable)

#### `app.mock(service, implementation)`

Mock a service at the application level (applies to all requests).

```ts
app.mock(DatabaseService, {
  query: () => Promise.resolve([]),
});
```

**Parameters:**
- `service` — A service definition created with `moduleDef.service()`
- `implementation` — Partial implementation of the service methods

**Returns:** `TestApp` (chainable)

**Note:** You only need to implement the methods your tests use. Unimplemented methods will throw if called.

#### `app.mockMiddleware(middleware, result)`

Mock a middleware at the application level.

```ts
app.mockMiddleware(AuthMiddleware, { user: { id: '1' } });
```

**Parameters:**
- `middleware` — A middleware definition created with `createMiddleware()`
- `result` — The value the middleware should provide

**Returns:** `TestApp` (chainable)

#### `app.env(vars)`

Set environment variables for the test application.

```ts
app.env({ DATABASE_URL: 'test-db', API_KEY: 'test-key' });
```

**Parameters:**
- `vars` — Object with environment variable key-value pairs

**Returns:** `TestApp` (chainable)

#### HTTP Methods: `app.get()`, `app.post()`, `app.put()`, `app.patch()`, `app.delete()`, `app.head()`

Make HTTP requests to your application.

```ts
const res = await app.get('/users');
const res = await app.post('/users', { body: { name: 'Jane' } });
const res = await app.put('/users/1', { 
  body: { name: 'Jane Doe' },
  headers: { 'Authorization': 'Bearer token' },
});
```

**Parameters:**
- `path` — Request path (e.g., `/users`, `/users/123`)
- `options` — Optional request options:
  - `body` — Request body (automatically serialized as JSON)
  - `headers` — Request headers

**Returns:** `TestRequestBuilder` (awaitable, see below)

### `TestRequestBuilder`

Returned by HTTP method calls. It's **awaitable** and also allows per-request mocking.

#### Await the Request

```ts
const res = await app.get('/users');
```

Returns a `TestResponse`:

```ts
interface TestResponse {
  status: number;           // HTTP status code
  body: unknown;            // Parsed response body (JSON)
  headers: Record<string, string>; // Response headers
  ok: boolean;              // true if status 2xx
}
```

#### Per-Request Mocking

Override mocks for a single request:

```ts
const res = await app.get('/users')
  .mock(DatabaseService, {
    query: () => Promise.resolve([{ id: '1', name: 'Mock User' }]),
  })
  .mockMiddleware(AuthMiddleware, { user: { id: 'test-user' } });
```

**Methods:**
- `mock(service, implementation)` — Mock a service for this request only
- `mockMiddleware(middleware, result)` — Mock a middleware for this request only

**Returns:** `TestRequestBuilder` (chainable and awaitable)

### `createTestService(service)`

Creates a test builder for isolated service testing.

```ts
import { createTestService } from '@vertz/testing';

const serviceInstance = await createTestService(UserService);
```

**Parameters:**
- `service` — A service definition created with `moduleDef.service()`

**Returns:** `TestServiceBuilder` (awaitable, see below)

### `TestServiceBuilder`

Returned by `createTestService()`. It's **awaitable** and allows dependency mocking.

#### Await the Service

```ts
const service = await createTestService(UserService);
```

Returns the service methods as an object.

#### Mock Dependencies

If the service has injected dependencies, you must mock them:

```ts
const service = await createTestService(UserService)
  .mock(DatabaseService, { query: () => Promise.resolve([]) })
  .mock(CacheService, { get: () => null, set: () => {} });
```

**Method:**
- `mock(dependency, implementation)` — Mock an injected dependency

**Returns:** `TestServiceBuilder` (chainable and awaitable)

**Error:** If you await a service with unmocked dependencies, it will throw:

```ts
// ❌ Throws: "Missing mock for injected dependency 'db'"
const service = await createTestService(UserService);

// ✅ Correct
const service = await createTestService(UserService)
  .mock(DatabaseService, { query: () => [] });
```

### `DeepPartial<T>`

Type helper for creating partial mocks.

```ts
import type { DeepPartial } from '@vertz/testing';

const mock: DeepPartial<ComplexService> = {
  users: {
    findById: () => Promise.resolve({ id: '1' }),
    // Other methods optional
  },
};
```

Allows you to implement only the methods you need for your test, even for nested objects.

## Testing Patterns

### Testing with Authentication

Mock the auth middleware to simulate authenticated requests:

```ts
it('returns user profile when authenticated', async () => {
  const app = createTestApp()
    .register(UserModule)
    .mockMiddleware(AuthMiddleware, { 
      user: { id: 'user-123', role: 'admin' } 
    });
  
  const res = await app.get('/users/me');
  
  expect(res.ok).toBe(true);
  expect(res.body).toMatchObject({ id: 'user-123' });
});
```

Per-request authentication:

```ts
it('requires authentication', async () => {
  const app = createTestApp().register(UserModule);
  
  // No auth
  const unauthorized = await app.get('/users/me');
  expect(unauthorized.status).toBe(401);
  
  // With auth
  const authorized = await app.get('/users/me')
    .mockMiddleware(AuthMiddleware, { user: { id: '1' } });
  expect(authorized.ok).toBe(true);
});
```

### Testing with Database

Mock database services to avoid hitting a real database:

```ts
it('creates a user in the database', async () => {
  const mockDb = {
    insert: vi.fn().mockResolvedValue({ id: 'new-id' }),
    query: vi.fn(),
  };
  
  const app = createTestApp()
    .register(UserModule)
    .mock(DatabaseService, mockDb);
  
  await app.post('/users', { body: { name: 'Jane' } });
  
  expect(mockDb.insert).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Jane' })
  );
});
```

### Testing Error Handling

```ts
it('returns 404 for missing user', async () => {
  const app = createTestApp()
    .register(UserModule)
    .mock(DatabaseService, {
      findById: () => null,
    });
  
  const res = await app.get('/users/999');
  
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({
    error: 'NotFound',
    message: expect.any(String),
  });
});

it('returns 400 for invalid input', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.post('/users', {
    body: { email: 'not-an-email' }, // Invalid email
  });
  
  expect(res.status).toBe(400);
});
```

### Testing Services with Dependencies

```ts
it('user service finds user by email', async () => {
  const userService = await createTestService(UserService)
    .mock(DatabaseService, {
      query: (sql: string) => {
        if (sql.includes('email')) {
          return Promise.resolve([{ id: '1', email: 'jane@example.com' }]);
        }
        return Promise.resolve([]);
      },
    });
  
  const user = await userService.findByEmail('jane@example.com');
  
  expect(user).toMatchObject({ id: '1', email: 'jane@example.com' });
});
```

### Testing with Query Parameters

```ts
it('filters users by query params', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.get('/users?role=admin&active=true');
  
  expect(res.ok).toBe(true);
  expect(res.body.users).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'admin', active: true }),
    ])
  );
});
```

### Testing Response Headers

```ts
it('sets cache headers', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.get('/users');
  
  expect(res.headers['cache-control']).toBe('public, max-age=3600');
});
```

### Testing with Request Headers

```ts
it('accepts custom headers', async () => {
  const app = createTestApp().register(ApiModule);
  
  const res = await app.get('/data', {
    headers: {
      'X-API-Key': 'test-key',
      'Accept-Language': 'en-US',
    },
  });
  
  expect(res.ok).toBe(true);
});
```

### Testing Schema Validation

Vertz automatically validates request/response schemas. Test that validation works:

```ts
it('validates request body against schema', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.post('/users', {
    body: { name: '', email: 'invalid' }, // Invalid data
  });
  
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({
    error: 'BadRequest',
  });
});
```

### Testing Route Parameters

```ts
it('handles route parameters', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.get('/users/user-123');
  
  expect(res.ok).toBe(true);
  expect(res.body.id).toBe('user-123');
});
```

### Testing Multiple Modules

```ts
it('integrates multiple modules', async () => {
  const app = createTestApp()
    .register(UserModule)
    .register(AuthModule)
    .register(PaymentModule);
  
  // Test cross-module behavior
  const loginRes = await app.post('/auth/login', {
    body: { email: 'jane@example.com', password: 'secret' },
  });
  
  const token = loginRes.body.token;
  
  const profileRes = await app.get('/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  expect(profileRes.ok).toBe(true);
});
```

### Testing with Service State

If a service maintains state via `onInit`:

```ts
it('initializes service with state', async () => {
  const service = await createTestService(CounterService)
    .mock(StorageService, {
      load: () => Promise.resolve({ count: 5 }),
    });
  
  const count = await service.getCount();
  expect(count).toBe(5);
  
  await service.increment();
  const newCount = await service.getCount();
  expect(newCount).toBe(6);
});
```

### Testing Module Options

Pass module options to configure behavior:

```ts
it('uses module options', async () => {
  const app = createTestApp().register(UserModule, {
    maxUsers: 100,
    enableCache: false,
  });
  
  const res = await app.get('/users');
  expect(res.ok).toBe(true);
});
```

## Integration with Vitest

This package is designed to work seamlessly with Vitest. Add to your `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

Then write tests using Vitest's API:

```ts
import { createTestApp } from '@vertz/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

describe('User routes', () => {
  let app: ReturnType<typeof createTestApp>;
  
  beforeEach(() => {
    app = createTestApp().register(UserModule);
  });
  
  it('returns users', async () => {
    const res = await app.get('/users');
    expect(res.ok).toBe(true);
  });
});
```

### Using Vitest Mocks

Combine with `vi.fn()` for advanced mocking:

```ts
it('calls database with correct params', async () => {
  const queryFn = vi.fn().mockResolvedValue([]);
  
  const app = createTestApp()
    .register(UserModule)
    .mock(DatabaseService, { query: queryFn });
  
  await app.get('/users?role=admin');
  
  expect(queryFn).toHaveBeenCalledWith(
    expect.stringContaining('role = $1'),
    ['admin']
  );
});
```

## TypeScript Support

All exports are fully typed with strict type inference:

```ts
import type {
  TestApp,
  TestRequestBuilder,
  TestResponse,
  TestServiceBuilder,
  DeepPartial,
} from '@vertz/testing';
```

The test utilities preserve full type safety:

```ts
// ✅ Type-safe service methods
const service = await createTestService(UserService);
const user = await service.findById('1'); // Typed as User

// ✅ Type-safe mocks
app.mock(DatabaseService, {
  query: () => [], // Return type inferred
});

// ❌ TypeScript error: Property 'invalidMethod' does not exist
app.mock(DatabaseService, {
  invalidMethod: () => {},
});
```

## Tips & Best Practices

### 1. Use Per-Request Mocks for Varying Behavior

When you need different behavior per test case, use per-request mocks:

```ts
it('handles different user states', async () => {
  const app = createTestApp().register(UserModule);
  
  // Active user
  const activeRes = await app.get('/users/1')
    .mock(DatabaseService, { findById: () => ({ id: '1', active: true }) });
  expect(activeRes.body.active).toBe(true);
  
  // Inactive user
  const inactiveRes = await app.get('/users/1')
    .mock(DatabaseService, { findById: () => ({ id: '1', active: false }) });
  expect(inactiveRes.body.active).toBe(false);
});
```

### 2. Mock Only What You Need

You don't need to implement every method — only the ones your test uses:

```ts
// ✅ Minimal mock
app.mock(DatabaseService, {
  findById: () => ({ id: '1' }),
  // Other methods omitted — they won't be called
});
```

### 3. Use `beforeEach` for Common Setup

```ts
describe('User API', () => {
  let app: ReturnType<typeof createTestApp>;
  
  beforeEach(() => {
    app = createTestApp()
      .register(UserModule)
      .mock(DatabaseService, { /* common mocks */ });
  });
  
  it('test 1', async () => { /* ... */ });
  it('test 2', async () => { /* ... */ });
});
```

### 4. Test Real Error Cases

Mock errors to test error handling:

```ts
it('handles database errors', async () => {
  const app = createTestApp()
    .register(UserModule)
    .mock(DatabaseService, {
      query: () => { throw new Error('Connection failed'); },
    });
  
  const res = await app.get('/users');
  
  expect(res.status).toBe(500);
});
```

### 5. Test Response Schemas

If you define response schemas, Vertz validates them automatically:

```ts
it('response matches schema', async () => {
  const app = createTestApp().register(UserModule);
  
  const res = await app.get('/users/1');
  
  // If the handler returns data that doesn't match the schema,
  // the test will throw a ResponseValidationError
  expect(res.ok).toBe(true);
});
```

## Common Errors

### Missing Mock for Dependency

```
Error: Missing mock for injected dependency "db".
Call .mock(dbService, impl) before awaiting.
```

**Solution:** Mock all injected dependencies:

```ts
const service = await createTestService(UserService)
  .mock(DatabaseService, { query: () => [] });
```

### Response Validation Error

```
ResponseValidationError: Response validation failed: Invalid type
```

**Cause:** The route handler returned data that doesn't match the response schema.

**Solution:** Fix the handler or the schema to match expected output.

## Related Packages

- [@vertz/core](../core) — Core framework and module system
- [@vertz/schema](../schema) — Schema validation (used in request/response validation)

## License

MIT
