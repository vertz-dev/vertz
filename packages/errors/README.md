# @vertz/errors

Unified error taxonomy for Vertz — Result types, domain errors, and exhaustive pattern matching for type-safe error handling across all application layers.

## Features

- **Error-as-value** — `Result<T, E>` type replaces throw/catch for predictable error handling
- **Domain error types** — Structured errors for schema, database, auth, and client layers
- **Entity errors** — HTTP-status-mirrored classes for server boundaries
- **Fetch errors** — Client-side HTTP request error hierarchy
- **Exhaustive matching** — `matchErr()` enforces handling all error cases at compile time
- **Error mapping** — Built-in utilities to transform errors across layers (DB → HTTP → Client)
- **Cross-module safety** — Symbol-based branding for reliable `instanceof` across module boundaries

## Installation

```bash
vtz add @vertz/errors
```

## Quick Start

```typescript
import { ok, err, type Result, match } from '@vertz/errors';

async function findUser(id: string): Promise<Result<User, { code: 'NOT_FOUND'; message: string }>> {
  const user = await db.users.findOne(id);
  if (!user) return err({ code: 'NOT_FOUND', message: `User ${id} not found` });
  return ok(user);
}

const result = await findUser('123');

const message = match(result, {
  ok: (user) => `Welcome, ${user.name}!`,
  err: (error) => `Error: ${error.message}`,
});
```

## Result Type

The core primitive — a discriminated union representing success or failure.

```typescript
type Result<T, E = unknown> = { ok: true; data: T } | { ok: false; error: E };
```

### Creating results

```typescript
import { ok, err } from '@vertz/errors';

ok({ name: 'Alice' }); // { ok: true, data: { name: 'Alice' } }
err('not found'); // { ok: false, error: 'not found' }
```

### Checking results

```typescript
import { isOk, isErr } from '@vertz/errors';

if (isOk(result)) {
  console.log(result.data); // Typed!
}
```

### Transforming results

```typescript
import { map, flatMap, unwrap, unwrapOr } from '@vertz/errors';

// Transform the success value
const names = map(result, (user) => user.name);

// Chain Result-returning operations
const profile = await flatMap(await findUser(id), (user) => findProfile(user.profileId));

// Extract or throw (use in tests/scripts)
const user = unwrap(result);

// Extract with default
const user = unwrapOr(result, defaultUser);
```

### Pattern matching

```typescript
import { match, matchErr } from '@vertz/errors';

// Simple match
const msg = match(result, {
  ok: (data) => `Got ${data.name}`,
  err: (error) => `Failed: ${error.message}`,
});

// Exhaustive match by error code — compiler error if you miss a case
matchErr(result, {
  ok: (data) => handleSuccess(data),
  NOT_FOUND: (e) => handleNotFound(e),
  UNIQUE_VIOLATION: (e) => handleDuplicate(e),
});
```

## Custom Domain Errors

Extend `AppError` for typed, serializable domain errors:

```typescript
import { AppError } from '@vertz/errors';

class InsufficientFundsError extends AppError<'INSUFFICIENT_FUNDS'> {
  constructor(
    public required: number,
    public available: number,
  ) {
    super('INSUFFICIENT_FUNDS', `Need $${required}, have $${available}`);
  }
}
```

## Domain Error Types

Structured error objects for specific layers — returned in Results, not thrown.

### Database errors

```typescript
import { createDBNotFoundError, isDBUniqueViolation } from '@vertz/errors';

// Read errors: NotFoundError
// Write errors: UniqueViolation, FKViolation, NotNullViolation, CheckViolation
```

### Auth errors

```typescript
import { createAuthInvalidCredentialsError, isAuthMfaRequiredError } from '@vertz/errors';

// InvalidCredentials, MfaRequired, SessionExpired, RateLimited, etc.
```

### Client errors

```typescript
import { createClientValidationError, isClientNotFoundError } from '@vertz/errors';

// ValidationError, NotFoundError, UnauthorizedError, ConflictError
```

## Entity Errors (Server Boundary)

HTTP-status-code-mirrored classes thrown at server boundaries:

```typescript
import { EntityNotFoundError, EntityValidationError, isForbiddenError } from '@vertz/errors';

throw new EntityNotFoundError('User not found'); // → 404
throw new EntityValidationError('Invalid input', errors); // → 422
```

| Class                     | Status |
| ------------------------- | ------ |
| `BadRequestError`         | 400    |
| `EntityUnauthorizedError` | 401    |
| `EntityForbiddenError`    | 403    |
| `EntityNotFoundError`     | 404    |
| `MethodNotAllowedError`   | 405    |
| `EntityConflictError`     | 409    |
| `EntityValidationError`   | 422    |
| `InternalError`           | 500    |
| `ServiceUnavailableError` | 503    |

## Fetch Errors (Client HTTP)

Error hierarchy for HTTP client requests:

```typescript
import { matchError, type FetchErrorType } from '@vertz/errors';

matchError(fetchError, {
  NotFound: (e) => console.log('Resource gone'),
  RateLimit: (e) => console.log('Slow down'),
  NetworkError: (e) => console.log('Connection failed'),
  _: (e) => console.log('Other error'),
});
```

## Error Mapping

Transform errors across layers:

```typescript
import { dbErrorToHttpStatus } from '@vertz/errors';

const status = dbErrorToHttpStatus(dbError);
// NotFound → 404, UNIQUE_VIOLATION → 409, FK_VIOLATION → 422
```

## License

MIT
