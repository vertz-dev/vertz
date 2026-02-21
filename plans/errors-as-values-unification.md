# Design Doc: Errors-as-Values Unification

**Status:** Approved → Ready for Implementation  
**Author:** mike (VP Eng)  
**Date:** 2026-02-21  
**Tickets:** #532, #533, #534, #535, #536, #537

## Context

Audit findings show inconsistent error handling across the stack:
- **database** uses `Result<T, E>` (errors-as-values) ✅
- **fetch** throws exceptions ❌
- **server/entity** throws exceptions ❌
- **codegen** generates code that calls throwing client ❌
- **3 different Result implementations** across `@vertz/errors`, `@vertz/schema`, and `@vertz/core` ❌

This violates our manifesto principle: **"Can an LLM use this correctly on the first prompt?"** Exception-based error handling requires LLMs to hallucinate try/catch patterns or miss error cases entirely.

## Goals

1. **Consolidate to a single Result type** — eliminate the 3 competing implementations
2. **Unify fetch package** — return `Result<T, E>` instead of throwing
3. **Unify server/entity** — accept Result from database and return Result to callers
4. **Update codegen** — generate code that handles Result return values
5. **Provide `matchError()` utility** — force exhaustive error handling across server and client

**Note:** This is greenfield — breaking changes are acceptable. We have no external users yet.

## API Surface

### 1. Consolidated Result Type

**Single source of truth:** `@vertz/errors`

```typescript
// packages/errors/src/result.ts
export type Result<T, E> = 
  | { ok: true; data: T }
  | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

**Helper functions** (already exist in `@vertz/errors`, keep them):
- `map()`, `flatMap()`, `match()`, `matchErr()`, `unwrap()`, `unwrapOr()`, `isOk()`, `isErr()`

Developers can use helpers for functional composition or explicit if-checks for clarity. Both patterns are supported.

**Migration:**
- `@vertz/schema` re-exports from `@vertz/errors` (maintains existing imports)
- `@vertz/core` Result **removed** (greenfield = no deprecation period, just migrate usages to `@vertz/errors`)

### 2. Error Classes (Not Just Unions)

Errors are **typed classes** (or branded types) to enable `matchError()` pattern matching and `instanceof` checks.

#### FetchError (Client-Side)

```typescript
// packages/fetch/src/errors.ts
export class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR' as const;
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class HttpError extends Error {
  readonly code = 'HTTP_ERROR' as const;
  constructor(
    public status: number,
    message: string,
    public serverCode?: string, // Parsed from server response { error: { code } }
    public body?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ParseError extends Error {
  readonly code = 'PARSE_ERROR' as const;
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(
    message: string,
    public errors: ReadonlyArray<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type FetchError = NetworkError | HttpError | TimeoutError | ParseError | ValidationError;
```

**Key addition:** `HttpError.serverCode` — when the server returns `{ error: { code: 'NOT_FOUND' } }`, the fetch client parses it and attaches it to `HttpError` so the client can switch on semantic codes.

#### EntityError (Server-Side)

Mirror the server's existing error codes from `@vertz/core` exceptions:

```typescript
// packages/errors/src/entity-errors.ts
export class BadRequestError extends Error {
  readonly code = 'BAD_REQUEST' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class MethodNotAllowedError extends Error {
  readonly code = 'METHOD_NOT_ALLOWED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MethodNotAllowedError';
  }
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class EntityValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(
    message: string,
    public errors: ReadonlyArray<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'EntityValidationError';
  }
}

export class InternalError extends Error {
  readonly code = 'INTERNAL_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InternalError';
  }
}

export class ServiceUnavailableError extends Error {
  readonly code = 'SERVICE_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export type EntityError =
  | BadRequestError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | MethodNotAllowedError
  | ConflictError
  | EntityValidationError
  | InternalError
  | ServiceUnavailableError;
```

### 3. `matchError()` Utility

**Location:** `@vertz/errors` (used by both server and client)

```typescript
// packages/errors/src/match-error.ts
type ErrorConstructor<E> = new (...args: any[]) => E;

type ErrorHandlers<E, R> = {
  [K in E as K['constructor']['name']]: (error: K) => R;
};

export function matchError<E extends Error, R>(
  error: E,
  handlers: ErrorHandlers<E, R>
): R {
  const handler = handlers[error.constructor.name as keyof typeof handlers];
  if (!handler) {
    throw new Error(`No handler for error type: ${error.constructor.name}`);
  }
  return handler(error as any);
}
```

**Usage (Client-Side):**
```typescript
const result = await userSdk.get(id);

if (!result.ok) {
  return matchError(result.error, {
    NetworkError: (e) => <NetworkErrorView retry={() => refetch()} />,
    HttpError: (e) => {
      if (e.serverCode === 'NOT_FOUND') return <UserNotFound />;
      if (e.serverCode === 'FORBIDDEN') return <AccessDenied />;
      return <ServerError status={e.status} />;
    },
    TimeoutError: (e) => <TimeoutView retry={() => refetch()} />,
    ParseError: (e) => <InvalidDataView />,
    ValidationError: (e) => <ValidationErrorView errors={e.errors} />,
  });
}

return <UserProfile user={result.data} />;
```

**Usage (Server-Side):**
```typescript
const dbResult = await db.users.get(id);

if (!dbResult.ok) {
  return matchError(dbResult.error, {
    NotFoundError: (e) => err(new NotFoundError(e.message)),
    DatabaseConnectionError: (e) => err(new ServiceUnavailableError('Database unavailable')),
    // ... other DB error types
  });
}
```

**Why this matters:** TypeScript enforces exhaustive checks. If a new error type is added, the compiler will error on every `matchError()` call until all branches are handled. This forces developers (and LLMs) to handle all error cases, leading to better UX.

### 4. Fetch Package Returns Result

**Type signature:**
```typescript
export interface Client {
  get<T>(url: string, options?: RequestOptions): Promise<Result<T, FetchError>>;
  post<T>(url: string, body?: unknown, options?: RequestOptions): Promise<Result<T, FetchError>>;
  patch<T>(url: string, body?: unknown, options?: RequestOptions): Promise<Result<T, FetchError>>;
  delete<T>(url: string, options?: RequestOptions): Promise<Result<T, FetchError>>;
}
```

**HTTP error parsing:**
When the server returns:
```json
{ "error": { "code": "NOT_FOUND", "message": "User not found" } }
```

The fetch client parses it and constructs:
```typescript
new HttpError(404, 'User not found', 'NOT_FOUND', responseBody)
```

So `result.error.serverCode === 'NOT_FOUND'` allows the client to switch on semantic server errors.

### 5. Server/Entity Returns Result

**Before (throws):**
```typescript
// packages/server/src/entity/crud-pipeline.ts
async function get(id: string): Promise<User> {
  const result = await db.users.get(id);
  if (!result.ok) {
    throw new NotFoundException(`User ${id} not found`);
  }
  return result.data;
}
```

**After (Result):**
```typescript
// packages/server/src/entity/crud-pipeline.ts
async function get(id: string): Promise<Result<User, EntityError>> {
  const result = await db.users.get(id);
  if (!result.ok) {
    return err(new NotFoundError(`User ${id} not found`));
  }
  return ok(result.data);
}
```

**HTTP layer:**
```typescript
// packages/server/src/entity/error-handler.ts
export function resultToHttpResponse<T>(result: Result<T, EntityError>): Response {
  if (result.ok) {
    return Response.json(result.data);
  }
  
  const { code, message } = result.error;
  const status = errorCodeToHttpStatus(code);
  
  // Include validation errors if present
  const body: any = { error: { code, message } };
  if (result.error instanceof EntityValidationError) {
    body.error.errors = result.error.errors;
  }
  
  return Response.json(body, { status });
}
```

### 6. Codegen Generates Result Handling

**Generated SDK:**
```typescript
// Generated by @vertz/codegen
export function createUserSdk(client: Client) {
  return {
    list: (query?: Record<string, unknown>) => 
      client.get<User[]>('/users', { query }),
    
    get: (id: string) => 
      client.get<User>(`/users/${id}`),
    
    create: Object.assign(
      (body: CreateUserInput) => client.post<User>('/users', body),
      {
        url: '/users',
        method: 'POST' as const,
        meta: { bodySchema: createUserInputSchema },
      },
    ),
  };
}
```

**Usage (LLM-generated):**
```typescript
const userSdk = createUserSdk(client);

const result = await userSdk.get('123');
if (result.ok) {
  console.log('User:', result.data.name);
} else {
  matchError(result.error, {
    NetworkError: (e) => console.error('Network issue:', e.message),
    HttpError: (e) => {
      if (e.serverCode === 'NOT_FOUND') console.error('User not found');
      else if (e.serverCode === 'FORBIDDEN') console.error('Access denied');
      else console.error('Server error:', e.status);
    },
    TimeoutError: (e) => console.error('Request timed out'),
    ParseError: (e) => console.error('Invalid response'),
    ValidationError: (e) => console.error('Validation failed:', e.errors),
  });
}
```

## Manifesto Alignment

### Explicit over Implicit
- Error cases are explicit in the return type — no hidden `throw` paths
- LLMs and developers see `Result<T, E>` and know they must handle both branches
- `matchError()` forces exhaustive handling at compile time

### Compile-time over Runtime
- TypeScript enforces exhaustive checks on `result.ok` before accessing `.data` or `.error`
- Missing error handler in `matchError()` = TypeScript error
- Compiler catches missing error handling at build time, not runtime

### Predictability over Convenience
- Every async operation returns the same shape: `Result<T, E>`
- No guessing about which operations throw vs return errors
- LLMs can generate correct handling code without training on our specific APIs
- `matchError()` provides a consistent pattern for error handling across server and client

### Type-safe from database to browser
- Error types flow from server to client without type loss
- Generated SDK preserves the exact error union from the server
- `serverCode` field bridges semantic server errors to client handling

## Non-Goals

- **Not adding Result to synchronous functions** — only async operations (fetch, database, server handlers) return Result
- **Not removing all exceptions** — programming errors (invalid arguments, logic bugs) can still throw
- **Not changing the Result shape** — sticking with `{ ok: true, data }` / `{ ok: false, error }` (already proven pattern)
- **Not enforcing Result everywhere immediately** — this is a phased migration
- **Not providing default error UI components** — we provide the primitive (`matchError()`), developers compose their own defaults if they want

## Unknowns

### 1. Breaking Changes for Existing Fetch Users ✅ RESOLVED

**Question:** How do we handle existing code that uses `try/catch` with the fetch client?

**Resolution:** Hard break. This is greenfield — no users yet. We'll change fetch to return Result cleanly without backward compatibility concerns.

### 2. Server Response Format ✅ RESOLVED

**Question:** Should the server's HTTP JSON error format change to match Result shape?

**Resolution:** Keep current format (`{ error: { code, message } }`). HTTP status code already signals success/error, so adding `ok: false` to the response body is redundant. The fetch client unwraps HTTP responses into Result internally.

### 3. Result Chaining Helpers ✅ RESOLVED

**Question:** Should we provide functional helpers for chaining Result operations (e.g., `andThen`, `map`)?

**Resolution:** Keep the existing helpers (`map`, `flatMap`, `match`, etc.) that are already in `@vertz/errors`. Developers can use them for functional composition or explicit if-checks for clarity. Don't add new chaining utilities beyond what exists.

### 4. VALIDATION_ERROR Code ✅ RESOLVED

**Question:** Should `FetchError` have a separate `ValidationError` class with field-level details?

**Resolution:** Yes. Add `ValidationError` class to `FetchError` with field-level details matching the server's validation error structure: `Array<{ path: string; message: string }>`.

### 5. EntityError Type ✅ RESOLVED

**Question:** What should the full `EntityError` union be?

**Resolution:** Mirror the server's existing error codes exactly: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.

### 6. Streaming ✅ DEFERRED

**Question:** Does `requestStream()` return Result or throw?

**Resolution:** Out of scope for this design. We'll revisit streaming when we understand the use cases better.

**All unknowns resolved — no POC required.**

## Type Flow Map

```
Database Operation → Result<T, ReadError | WriteError>
  ↓
Server Handler → Result<T, EntityError>
  ↓
HTTP Response → JSON { error?: { code, message, errors? } }
  ↓
Fetch Client → Result<T, FetchError> (parses serverCode from response)
  ↓
Generated SDK → Result<T, FetchError>
  ↓
Application Code → matchError(result.error, { NetworkError: ..., HttpError: ..., ... })
```

Each transition point requires tests validating the error type is preserved.

## E2E Acceptance Test

**Test scenario:** Create a user through the generated SDK, handle all error cases

```typescript
// test/e2e/errors-as-values.test.ts
import { describe, test, expect } from 'bun:test';
import { createClient } from '@vertz/fetch';
import { createUserSdk } from './generated/entities/user';
import { matchError } from '@vertz/errors';

describe('Errors-as-values E2E', () => {
  test('happy path: create user returns ok result', async () => {
    const client = createClient({ baseURL: 'http://localhost:3000' });
    const userSdk = createUserSdk(client);
    
    const result = await userSdk.create({ name: 'Alice', email: 'alice@example.com' });
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.email).toBe('alice@example.com');
    }
  });
  
  test('validation error: create user with missing fields returns error result', async () => {
    const client = createClient({ baseURL: 'http://localhost:3000' });
    const userSdk = createUserSdk(client);
    
    // @ts-expect-error - missing required email field
    const result = await userSdk.create({ name: 'Bob' });
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      matchError(result.error, {
        ValidationError: (e) => {
          expect(e.errors).toHaveLength(1);
          expect(e.errors[0].path).toBe('email');
        },
        NetworkError: () => fail('Should not be network error'),
        HttpError: () => fail('Should be ValidationError, not generic HttpError'),
        TimeoutError: () => fail('Should not be timeout'),
        ParseError: () => fail('Should not be parse error'),
      });
    }
  });
  
  test('not found: get non-existent user returns error result', async () => {
    const client = createClient({ baseURL: 'http://localhost:3000' });
    const userSdk = createUserSdk(client);
    
    const result = await userSdk.get('non-existent-id');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      matchError(result.error, {
        HttpError: (e) => {
          expect(e.status).toBe(404);
          expect(e.serverCode).toBe('NOT_FOUND');
        },
        NetworkError: () => fail('Should not be network error'),
        TimeoutError: () => fail('Should not be timeout'),
        ParseError: () => fail('Should not be parse error'),
        ValidationError: () => fail('Should not be validation error'),
      });
    }
  });
  
  test('network error: fetch to unreachable server returns error result', async () => {
    const client = createClient({ baseURL: 'http://localhost:9999' }); // non-existent port
    const userSdk = createUserSdk(client);
    
    const result = await userSdk.get('123');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      matchError(result.error, {
        NetworkError: (e) => {
          expect(e.message).toContain('connection');
        },
        HttpError: () => fail('Should not be HTTP error'),
        TimeoutError: () => fail('Should not be timeout'),
        ParseError: () => fail('Should not be parse error'),
        ValidationError: () => fail('Should not be validation error'),
      });
    }
  });
  
  test('timeout: slow server returns timeout error', async () => {
    const client = createClient({ baseURL: 'http://localhost:3000', timeout: 1 }); // 1ms timeout
    const userSdk = createUserSdk(client);
    
    const result = await userSdk.get('123');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      matchError(result.error, {
        TimeoutError: (e) => {
          expect(e.message).toContain('timeout');
        },
        NetworkError: () => fail('Should not be network error'),
        HttpError: () => fail('Should not be HTTP error'),
        ParseError: () => fail('Should not be parse error'),
        ValidationError: () => fail('Should not be validation error'),
      });
    }
  });
  
  test('parse error: invalid JSON returns parse error', async () => {
    // Mock a server that returns invalid JSON
    const client = createClient({ baseURL: 'http://localhost:3000' });
    const userSdk = createUserSdk(client);
    
    const result = await userSdk.get('invalid-json-response');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      matchError(result.error, {
        ParseError: (e) => {
          expect(e.message).toContain('parse');
        },
        NetworkError: () => fail('Should not be network error'),
        HttpError: () => fail('Should not be HTTP error'),
        TimeoutError: () => fail('Should not be timeout'),
        ValidationError: () => fail('Should not be validation error'),
      });
    }
  });
});
```

**Type-level acceptance:**
```typescript
// test/types/errors-as-values.test-d.ts
import { expectType } from 'tsd';
import type { Result } from '@vertz/errors';
import { createClient, type FetchError } from '@vertz/fetch';

const client = createClient({ baseURL: 'http://localhost:3000' });

// Verify Result type is inferred correctly
const result = await client.get<User>('/users/123');
expectType<Result<User, FetchError>>(result);

// Verify data access requires ok check
if (result.ok) {
  expectType<User>(result.data);
  // @ts-expect-error - error should not be accessible in ok branch
  result.error;
}

// Verify error access requires !ok check
if (!result.ok) {
  expectType<FetchError>(result.error);
  // @ts-expect-error - data should not be accessible in error branch
  result.data;
}

// Verify matchError requires all error types
matchError(result.error, {
  NetworkError: (e) => 'handled',
  HttpError: (e) => 'handled',
  TimeoutError: (e) => 'handled',
  ParseError: (e) => 'handled',
  ValidationError: (e) => 'handled',
  // @ts-expect-error - missing handler should cause type error
});
```

## Implementation Phases

### Phase 1: Consolidate Result Type
- Move Result type to `@vertz/errors` (already done)
- Update `@vertz/schema` to re-export from `@vertz/errors`
- Remove `@vertz/core` Result, migrate usages to `@vertz/errors`
- Document existing helper functions (`map`, `flatMap`, etc.)
- Tests: verify imports work from both `@vertz/errors` and `@vertz/schema`

### Phase 2: Add Error Classes + matchError()
- Define `FetchError` classes (NetworkError, HttpError, TimeoutError, ParseError, ValidationError)
- Define `EntityError` classes (mirror server error codes)
- Implement `matchError()` utility in `@vertz/errors`
- Tests: verify error class construction and `matchError()` exhaustiveness

### Phase 3: Update Fetch Package
- Change client methods to return `Result<T, FetchError>`
- Parse `{ error: { code } }` from HTTP responses and attach as `serverCode` to `HttpError`
- Update error handling internals to construct error classes
- Tests: E2E tests for all error cases (network, HTTP, timeout, parse, validation)

### Phase 4: Update Server/Entity
- Change CRUD operations to return `Result<T, EntityError>`
- Update HTTP response mapping to extract server code for client
- Tests: verify error codes map correctly to HTTP status + server code in response

### Phase 5: Update Codegen
- Generate Result-returning SDK methods
- Update templates to return `Result<T, FetchError>`
- Tests: verify generated code compiles and handles Result correctly

### Phase 6: E2E Validation
- Run full E2E acceptance test suite
- Verify type flow map with `.test-d.ts` files
- Document developer patterns (exhaustive matching, partial handling, catch-all)
- Add migration guide for internal code

## Approvals

- [x] **Developer experience (josh):** API intuitive? Error handling flow clear? ✅ APPROVED with concerns addressed
- [x] **Product/scope (pm):** Fits roadmap? Reasonable scope? ✅ APPROVED
- [x] **Technical feasibility (ben):** Can be built as designed? ✅ APPROVED with concerns addressed

**All concerns from reviews have been resolved in this design.**

---

**Next steps:**
1. Break into tickets (one per phase)
2. Assign to engineers
3. Execute TDD implementation
