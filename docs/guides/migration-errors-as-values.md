# Migration Guide: Errors-as-Values

This guide helps you migrate from exception-based error handling to the errors-as-values pattern using `Result<T, E>`.

## Why Migrate?

The errors-as-values pattern provides:

- **Explicit errors** — No hidden throw paths
- **Type safety** — TypeScript enforces error handling
- **Better UX** — Users see structured error information
- **LLM-friendly** — Code is self-documenting

## Before/After Comparisons

### Basic Fetch

**Before (try/catch):**

```typescript
try {
  const user = await fetch(`/users/${id}`).then(r => r.json());
  console.log(user.name);
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network failed');
  } else if (error instanceof HttpError) {
    if (error.status === 404) {
      console.error('User not found');
    } else {
      console.error('HTTP error:', error.status);
    }
  }
}
```

**After (Result + matchError):**

```typescript
const result = await client.get<User>(`/users/${id}`);

if (result.ok) {
  console.log(result.data.name);
} else {
  matchError(result.error, {
    NETWORK_ERROR: (e) => console.error('Network failed'),
    HTTP_ERROR: (e) => {
      if (e.serverCode === 'NOT_FOUND') {
        console.error('User not found');
      } else {
        console.error('HTTP error:', e.status);
      }
    },
    TIMEOUT_ERROR: (e) => console.error('Timeout'),
    PARSE_ERROR: (e) => console.error('Parse failed'),
    VALIDATION_ERROR: (e) => console.error('Validation failed'),
  });
}
```

### Form Submission

**Before:**

```typescript
async function submitForm(data: CreateUserInput) {
  try {
    const response = await fetch('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      if (response.status === 409) {
        const body = await response.json();
        return { error: 'EMAIL_EXISTS', field: 'email' };
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    return { success: true, user: await response.json() };
  } catch (error) {
    return { error: 'NETWORK_ERROR' };
  }
}
```

**After:**

```typescript
import { FetchValidationError, FetchConflictError } from '@vertz/errors';

async function submitForm(data: CreateUserInput): Promise<
  { success: true; user: User } |
  { success: false; error: FormError }
> {
  const result = await client.post<User>('/users', data);
  
  if (result.ok) {
    return { success: true, user: result.data };
  }
  
  return matchError(result.error, {
    NETWORK_ERROR: () => ({ success: false, error: 'NETWORK_ERROR' }),
    HTTP_ERROR: (e) => {
      if (e.serverCode === 'EMAIL_EXISTS') {
        return { success: false, error: 'EMAIL_EXISTS', field: 'email' };
      }
      return { success: false, error: 'SERVER_ERROR', status: e.status };
    },
    TIMEOUT_ERROR: () => ({ success: false, error: 'TIMEOUT' }),
    PARSE_ERROR: () => ({ success: false, error: 'PARSE_ERROR' }),
    VALIDATION_ERROR: (e) => ({ success: false, error: 'VALIDATION', errors: e.errors }),
  });
}
```

### Validation Error Handling

**Before:**

```typescript
try {
  await validateForm(data);
  const response = await fetch('/users', { ... });
} catch (error) {
  if (error instanceof ValidationError) {
    setErrors(error.errors);
  } else if (error instanceof NetworkError) {
    showToast('Network error');
  }
}
```

**After:**

```typescript
const result = await userSdk.create(data);

if (!result.ok) {
  return matchError(result.error, {
    NETWORK_ERROR: () => showToast('Network error'),
    TIMEOUT_ERROR: () => showToast('Request timed out'),
    PARSE_ERROR: () => showToast('Invalid response'),
    VALIDATION_ERROR: (e) => setErrors(e.errors),
    HTTP_ERROR: (e) => showToast(e.message),
  });
}

showSuccess('User created!');
```

## Old Error Types → New Error Types

| Old Type | New Type | Notes |
|----------|----------|-------|
| `Error` | `FetchNetworkError` | Network failures |
| `HttpError` | `HttpError` | Generic HTTP errors |
| `Error 400` | `FetchBadRequestError` | Use specific class |
| `Error 401` | `FetchUnauthorizedError` | Authentication failed |
| `Error 403` | `FetchForbiddenError` | Access denied |
| `Error 404` | `FetchNotFoundError` | Resource not found |
| `Error 409` | `FetchConflictError` | Conflict |
| `Error 422` | `FetchUnprocessableEntityError` | Validation failed on server |
| `Error 429` | `FetchRateLimitError` | Rate limited |
| `Error 500` | `FetchInternalServerError` | Server error |
| `Error 503` | `FetchServiceUnavailableError` | Service unavailable |
| `TimeoutError` | `FetchTimeoutError` | Request timeout |
| `SyntaxError` | `ParseError` | JSON parse failed |

## Step-by-Step Migration Checklist

### Phase 1: Update Import Statements

```diff
- import { client } from './client';
+ import { client } from '@vertz/fetch';
+ import { matchError } from '@vertz/errors';
```

### Phase 2: Change Function Signatures

**Before:**
```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/users/${id}`);
  if (!response.ok) throw new Error('Failed');
  return response.json();
}
```

**After:**
```typescript
import { Result } from '@vertz/errors';

async function fetchUser(id: string): Promise<Result<User, FetchError>> {
  return client.get<User>(`/users/${id}`);
}
```

### Phase 3: Update Call Sites

**Before:**
```typescript
try {
  const user = await fetchUser('123');
  renderUser(user);
} catch (error) {
  showError(error.message);
}
```

**After:**
```typescript
const result = await fetchUser('123');

if (result.ok) {
  renderUser(result.data);
} else {
  matchError(result.error, {
    NETWORK_ERROR: (e) => showError('Network error'),
    HTTP_ERROR: (e) => showError(e.message),
    TIMEOUT_ERROR: (e) => showError('Timeout'),
    PARSE_ERROR: (e) => showError('Parse error'),
    VALIDATION_ERROR: (e) => showValidationErrors(e.errors),
  });
}
```

### Phase 4: Add Exhaustive Handling

Ensure every error type has a handler:

```typescript
// This will error at compile time if you add a new error type
matchError(result.error, {
  NETWORK_ERROR: (e) => ...,
  HTTP_ERROR: (e) => ...,
  TIMEOUT_ERROR: (e) => ...,
  PARSE_ERROR: (e) => ...,
  VALIDATION_ERROR: (e) => ...,
  // All 5 must be handled!
});
```

### Phase 5: Test Error Paths

Verify your error handling works:

- Network disconnect → NETWORK_ERROR handler fires
- 404 response → HTTP_ERROR with serverCode='NOT_FOUND'
- Invalid JSON → PARSE_ERROR
- Long request → TIMEOUT_ERROR
- Invalid input → VALIDATION_ERROR with errors array

## Codegen Migration

If you're using generated SDKs:

**Before (exception-based):**

```typescript
// Generated code threw exceptions
const user = await sdk.getUser('123');
```

**After (Result-based):**

```typescript
// Generated code returns Result
const result = await sdk.getUser('123');

if (result.ok) {
  const user = result.data;
} else {
  matchError(result.error, {
    NETWORK_ERROR: ...,
    HTTP_ERROR: ...,
    TIMEOUT_ERROR: ...,
    PARSE_ERROR: ...,
    VALIDATION_ERROR: ...,
  });
}
```

## Server-Side Entity Errors

For server-side code, entity errors use a similar pattern:

```typescript
import { matchError, EntityError } from '@vertz/errors';

const result = await db.users.create(data);

if (!result.ok) {
  return matchError(result.error, {
    BAD_REQUEST: (e) => Response.json({ error: e.message }, { status: 400 }),
    UNAUTHORIZED: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    FORBIDDEN: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
    NOT_FOUND: (e) => Response.json({ error: e.message }, { status: 404 }),
    CONFLICT: (e) => Response.json({ error: e.message }, { status: 409 }),
    ENTITY_VALIDATION_ERROR: (e) => Response.json({ error: e.errors }, { status: 422 }),
    INTERNAL_ERROR: () => Response.json({ error: 'Internal error' }, { status: 500 }),
    SERVICE_UNAVAILABLE: () => Response.json({ error: 'Service unavailable' }, { status: 503 }),
    METHOD_NOT_ALLOWED: () => Response.json({ error: 'Method not allowed' }, { status: 405 }),
  });
}

return Response.json(result.data, { status: 201 });
```

## Common Gotchas

### Forgetting the ok Check

```typescript
// ❌ Wrong — won't compile
const name = result.data.name;

// ✅ Correct
if (result.ok) {
  const name = result.data.name;
}
```

### Missing Error Handlers

```typescript
// ❌ Wrong — won't compile (missing VALIDATION_ERROR)
matchError(result.error, {
  NETWORK_ERROR: (e) => ...,
  HTTP_ERROR: (e) => ...,
  TIMEOUT_ERROR: (e) => ...,
  PARSE_ERROR: (e) => ...,
  // VALIDATION_ERROR not handled!
});

// ✅ Correct — all handlers present
matchError(result.error, {
  NETWORK_ERROR: (e) => ...,
  HTTP_ERROR: (e) => ...,
  TIMEOUT_ERROR: (e) => ...,
  PARSE_ERROR: (e) => ...,
  VALIDATION_ERROR: (e) => ...,
});
```

### Using serverCode Without HTTP_ERROR

```typescript
// ❌ Wrong — serverCode is only on HttpError
matchError(result.error, {
  NETWORK_ERROR: (e) => console.log(e.serverCode), // undefined!
  ...
});

// ✅ Correct
matchError(result.error, {
  HTTP_ERROR: (e) => console.log(e.serverCode), // Has value!
  ...
});
```

## Rollback Plan

If you need to temporarily support both patterns:

```typescript
function toResult<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  return promise
    .then(data => ok(data))
    .catch(error => err(error));
}
```

But prefer full migration — mixed patterns create confusion.
