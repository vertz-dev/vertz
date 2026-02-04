# Vertz Testing Design Plan

## Philosophy

Vertz follows the **Testing Trophy** approach (Kent C. Dodds / Guillermo Rauch):

> "Write tests. Not too many. Mostly integration."

| Layer | Vertz approach |
|---|---|
| Static analysis | TypeScript + compiler enforcements (first line of defense) |
| Integration tests | **Primary testing approach** — test through routes |
| Unit tests | Optional, for complex isolated business logic |
| E2E tests | Out of scope for the framework |

Integration tests are the default because they:
- Test real behavior — what the consumer actually sees
- Catch DI wiring issues, middleware composition, schema validation
- Don't break when you refactor internal service implementation
- Are not tightly coupled to implementation details

Unit tests are opt-in for:
- Complex business logic (pricing calculations, permission matrices)
- Algorithmic code
- Pure functions with many edge cases

---

## Integration Testing

### Creating a Test App

Builder pattern mirrors the production app composition. Each `.register()`, `.mock()`, and `.mockMiddleware()` call gets its own type hints — no bloated error on a single object.

```tsx
// user.router.test.ts
import { vertz } from '@vertz/core';
import { userModule } from './user.module';
import { coreModule } from '../core/core.module';
import { dbService } from '../core/db.service';
import { authMiddleware } from '../../middlewares/auth.middleware';

const mockDb = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const app = vertz.testing
  .createApp()
  .env({
    DATABASE_URL: 'postgres://test:test@localhost/test',
    JWT_SECRET: 'a]eN9$mR!pL3xQ7v@wK2yB8cF0gH5jT',
    NODE_ENV: 'development',
  })
  .mock(dbService, mockDb)
  .mockMiddleware(authMiddleware, {
    user: { id: 'default-user', role: 'admin' },
  })
  .register(coreModule)
  .register(userModule, {
    requireEmailVerification: false,
    maxLoginAttempts: 5,
  });
```

### Making Requests

Route strings are **fully typed** — autocomplete suggests only registered routes. Params, body, query, and response are typed per route based on their schemas.

```tsx
// Autocomplete suggests registered routes
app.get('/users')          // ✓ listUsers route
app.get('/users/:id')      // ✓ readUser route
app.post('/users')         // ✓ createUser route
app.post('/orders')        // ✗ Type error — orderModule not registered
```

### Request Builder

Each request returns a thenable builder. Chain `.mock()` and `.mockMiddleware()` for per-request overrides. `await` the builder to execute the request.

```tsx
// Simple request
const res = await app
  .get('/users/:id', { params: { id: '123' } });

// With per-request overrides
const res = await app
  .get('/users/:id', { params: { id: '123' } })
  .mockMiddleware(authMiddleware, { user: { id: 'viewer', role: 'viewer' } });
```

The builder implements `.then()` internally — `await` triggers execution.

### Per-Request Overrides

Override mocks and middleware results for a specific request without affecting other tests:

```tsx
const res = await app
  .get('/users/:id', { params: { id: '123' } })
  .mockMiddleware(authMiddleware, {
    user: { id: 'viewer', role: 'viewer' },
  })
  .mock(dbService, {
    user: {
      findUnique: vi.fn().mockResolvedValueOnce(null),
    },
  });
```

### Typed Request Data

Params, body, query, and headers are typed based on the route's schema definitions:

```tsx
// Params typed per route
app.get('/users/:id', {
  params: { id: '123' },       // ✓ Typed as { id: string }
});
app.get('/users/:id', {
  params: { userId: '123' },   // ✗ Type error — no `userId` param
});

// Body typed per route
app.post('/users', {
  body: {
    name: 'Jane',
    email: 'jane@example.com',
    password: 'securepass123',
  },                            // ✓ Matches createUserBody schema
});
app.post('/users', {
  body: { name: 123 },         // ✗ Type error — name must be string
});

// Headers typed per route
app.post('/webhooks/stripe', {
  headers: {
    'stripe-signature': 'whsec_test123',  // ✓ Required by route schema
  },
  body: { ... },
});
```

### Typed Response

`res.body` is a union type — success responses are typed from the route's response schema, error responses follow a standard error shape:

```tsx
const res = await app.get('/users/:id', { params: { id: '123' } });

if (res.ok) {
  // res.body is typed as the route's response schema
  res.body.id;        // string ✓
  res.body.name;      // string ✓
  res.body.email;     // string ✓
  res.body.createdAt; // Date ✓
  res.body.age;       // ✗ Type error — not in response schema
}

if (!res.ok) {
  // res.body is typed as ErrorResponse
  res.body.message;   // string ✓
  res.body.code;      // string ✓ (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
  res.body.details;   // unknown (optional, validation errors etc.)
}
```

`res.ok` is `true` for 2xx status codes, `false` otherwise. TypeScript narrows `res.body` based on the check — no manual casting needed.

### Response Validation

In test mode, the framework validates handler return values against the response schema. This catches mismatches that would produce incorrect OpenAPI docs:

```
✗ Response validation failed for GET /users/:id

  Unexpected key: "unexpected"
  Expected shape: { id: string, name: string, email: string, createdAt: Date }
```

---

## Mocking

### Two Scopes

| Scope | API | Applies to |
|---|---|---|
| App-level | `.mock(service, impl)` / `.mockMiddleware(middleware, result)` | All requests |
| Per-request | `.mock()` / `.mockMiddleware()` on request builder | Single request |

Per-request overrides take precedence over app-level defaults.

### Service Mocks

Mock by service reference. The mock shape is typed to match the service's public API:

```tsx
// App-level mock
.mock(dbService, {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
})

// ✗ Type error — `findUniqe` is a typo
.mock(dbService, {
  user: {
    findUniqe: vi.fn(),
  },
})
```

### Middleware Mocks

Mock by middleware reference. The result is typed to match the middleware's `Provides` generic:

```tsx
// authMiddleware provides { user: User }
.mockMiddleware(authMiddleware, {
  user: { id: '1', role: 'admin' },    // ✓ Matches Provides type
})

// ✗ Type error — missing `user`
.mockMiddleware(authMiddleware, {})

// ✗ Type error — wrong shape
.mockMiddleware(authMiddleware, {
  user: { name: 'John' },              // Missing id, role
})

// requestIdMiddleware provides { requestId: string }
.mockMiddleware(requestIdMiddleware, {
  requestId: 'test-123',               // ✓ Correct type
})
```

When a middleware is mocked, it is bypassed — the mocked result is used directly. Non-mocked middlewares run normally.

---

## Full Example

```tsx
// user.router.test.ts
import { vertz } from '@vertz/core';
import { userModule } from './user.module';
import { coreModule } from '../core/core.module';
import { dbService } from '../core/db.service';
import { authMiddleware } from '../../middlewares/auth.middleware';

describe('User routes', () => {
  const mockDb = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  };

  const app = vertz.testing
    .createApp()
    .env({
      DATABASE_URL: 'postgres://test:test@localhost/test',
      JWT_SECRET: 'a]eN9$mR!pL3xQ7v@wK2yB8cF0gH5jT',
      NODE_ENV: 'development',
    })
    .mock(dbService, mockDb)
    .mockMiddleware(authMiddleware, {
      user: { id: 'default-user', role: 'admin' },
    })
    .register(coreModule)
    .register(userModule, {
      requireEmailVerification: false,
      maxLoginAttempts: 5,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /users/:id', () => {
    it('returns user by id', async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        id: '123',
        name: 'John',
        email: 'john@example.com',
        createdAt: new Date('2025-01-01'),
      });

      const res = await app
        .get('/users/:id', { params: { id: '123' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: '123',
        name: 'John',
        email: 'john@example.com',
        createdAt: expect.any(Date),
      });
    });

    it('returns 404 when user not found', async () => {
      mockDb.user.findUnique.mockResolvedValueOnce(null);

      const res = await app
        .get('/users/:id', { params: { id: 'not-found' } });

      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const res = await app
        .get('/users/:id', { params: { id: '123' } })
        .mockMiddleware(authMiddleware, {
          user: { id: 'viewer', role: 'viewer' },
        });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /users', () => {
    it('creates a user', async () => {
      mockDb.user.create.mockResolvedValueOnce({
        id: '456',
        name: 'Jane',
        email: 'jane@example.com',
        createdAt: new Date(),
      });

      const res = await app
        .post('/users', {
          body: {
            name: 'Jane',
            email: 'jane@example.com',
            password: 'securepass123',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Jane');
    });

    it('returns 400 for invalid email', async () => {
      const res = await app
        .post('/users', {
          body: {
            name: 'Jane',
            email: 'not-an-email',
            password: 'securepass123',
          },
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /users/:id/activate', () => {
    it('activates user', async () => {
      const res = await app
        .post('/users/:id/activate', { params: { id: '123' } });

      expect(res.status).toBe(200);
    });
  });
});
```

---

## Unit Testing Services (Opt-in)

For complex business logic that benefits from isolated testing:

```tsx
// auth.service.test.ts
import { vertz } from '@vertz/core';
import { authService } from './auth.service';
import { userService } from './user.service';
import { dbService } from '../core/db.service';

describe('AuthService', () => {
  const mockDb = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockUserService = {
    findByEmail: vi.fn(),
  };

  const service = vertz.testing
    .createService(authService)
    .mock(dbService, mockDb)
    .mock(userService, mockUserService)
    .options({
      maxLoginAttempts: 3,
    })
    .env({
      JWT_SECRET: 'a]eN9$mR!pL3xQ7v@wK2yB8cF0gH5jT',
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('locks account after max login attempts', async () => {
    mockUserService.findByEmail.mockResolvedValue({
      id: '123',
      loginAttempts: 3,
      locked: false,
    });

    await expect(
      service.login('user@example.com', 'wrong-password')
    ).rejects.toThrow('Account locked');
  });
});
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Builder pattern for test app | Isolated type hints per call, mirrors production app |
| Builder pattern for requests | Per-request overrides with typed `.mockMiddleware()` |
| Typed route strings | Autocomplete for registered routes, impossible to test non-existent routes |
| Typed response body | `res.body` matches response schema, catches misuse in assertions |
| Response validation in tests | Catches handler/schema mismatches that break OpenAPI docs |
| Thenable builder (no `.send()`) | One way to execute — `await` the builder. No ambiguity |
| Mock by reference | `.mock(dbService, ...)` not `.mock('dbService', ...)` — refactor-safe |
| Middleware mock by reference | `.mockMiddleware(authMiddleware, ...)` — typed to Provides generic |
| Non-mocked middlewares run | Real middleware execution by default, mock only what you need |
| Prisma-like mock shape | Matches the ORM pattern used in services |
| Vitest as test runner | Fast, ESM-native, TypeScript-first, `vi.fn()` built-in |
| Union response body | `res.ok` narrows body to success or error type — no manual casting |
| Typed request headers | Routes that define a `headers` schema get typed headers in tests |

---

## Test Runner

Vertz uses **Vitest** as its test runner. Not configurable — one way to do things.

Why Vitest:
- ESM-native — matches Vertz's module system
- TypeScript-first — no separate compilation step
- `vi.fn()`, `vi.spyOn()` built-in — no extra mocking library
- Compatible with `expect` API from Jest (familiar)
- Fast watch mode with HMR

Vitest is configured with `globals: true` — `vi`, `describe`, `it`, `expect` are available without imports. No need to wrap Vitest primitives in a Vertz abstraction — `vi.fn()` is `vi.fn()`, not `vertz.fn()`. Adding a wrapper would create an abstraction layer with no clear benefit while hiding a well-documented API behind a proprietary one.

---

## Open Items

- [ ] Auto-mock vs explicit mocks tradeoffs (full analysis needed)
- [ ] HTTP request recording — VCR/nock-style snapshot of external HTTP calls for replay in tests
- [ ] Snapshot testing support
- [ ] Test coverage tooling integration
- [ ] Testing WebSocket routes (future)
- [ ] Testing background jobs (future)
