# Error Handling Guide

This guide covers the errors-as-values pattern used throughout Vertz. Instead of throwing exceptions, operations return a `Result<T, E>` type that makes error handling explicit and type-safe.

## The Result Type

Every operation that can fail returns a `Result<T, E>` instead of throwing:

```typescript
import { Result, ok, err } from '@vertz/errors';

// Success case
const success: Result<User, FetchError> = ok({ id: '1', name: 'Alice' });

// Failure case
const failure: Result<User, FetchError> = err(new FetchNotFoundError('User not found'));
```

The `Result` type is a discriminated union with two variants:

- **`{ ok: true, data: T }`** — Success, contains the value
- **`{ ok: false, error: E }`** — Failure, contains the error

## Checking Results

### Using `result.ok`

The simplest approach — check the `ok` property:

```typescript
const result = await userSdk.get('123');

if (result.ok) {
  // TypeScript knows result.data exists here
  console.log('User:', result.data.name);
} else {
  // TypeScript knows result.error exists here
  console.error('Error:', result.error.message);
}
```

### Using Type Guards

Vertz provides type guards for Result:

```typescript
import { isOk, isErr } from '@vertz/errors';

const result = await userSdk.get('123');

if (isOk(result)) {
  // result is typed as Ok<User>
  console.log(result.data);
}

if (isErr(result)) {
  // result is typed as Err<FetchError>
  console.error(result.error);
}
```

## Using matchError() for Exhaustive Handling

The `matchError()` function provides **compile-time exhaustiveness checking**. If you add a new error type but forget to handle it, TypeScript will error.

### FetchError Types

When making HTTP requests, you can receive these error types:

```typescript
import { matchError, FetchNetworkError, HttpError, FetchTimeoutError, ParseError, FetchValidationError } from '@vertz/errors';

const result = await userSdk.get('123');

if (!result.ok) {
  const message = matchError(result.error, {
    NetworkError: (e) => `Network failed: ${e.message}`,
    HttpError: (e) => `HTTP ${e.status}: ${e.message}`,
    TimeoutError: (e) => `Request timed out`,
    ParseError: (e) => `Failed to parse: ${e.path}`,
    ValidationError: (e) => `Validation failed: ${e.errors.map(x => x.message).join(', ')}`,
  });
  
  console.error(message);
}
```

### HTTP Status Codes

For HTTP errors, you can also check the status code and `serverCode`:

```typescript
if (!result.ok) {
  matchError(result.error, {
    HttpError: (e) => {
      // Check server code for semantic errors
      if (e.serverCode === 'NOT_FOUND') {
        return <UserNotFound />;
      }
      if (e.serverCode === 'FORBIDDEN') {
        return <AccessDenied />;
      }
      if (e.serverCode === 'EMAIL_EXISTS') {
        return <EmailInUse />;
      }
      
      // Fallback to HTTP status
      return <ErrorView status={e.status} message={e.message} />;
    },
    NetworkError: (e) => <NetworkError retry={refetch} />,
    TimeoutError: (e) => <TimeoutError retry={refetch} />,
    ParseError: (e) => <InvalidDataError />,
    ValidationError: (e) => <FormErrors errors={e.errors} />,
  });
}
```

## All FetchError Types

### Network Errors

**`FetchNetworkError`** — Request couldn't reach the server

```typescript
// When the server is unreachable
const result = await client.get('/users');
// result.error instanceof FetchNetworkError → true
// result.error.code → 'NetworkError'
```

### HTTP Errors

**`HttpError`** — Server returned an error response

```typescript
// Includes status code and optional serverCode
result.error.status;        // 404, 500, etc.
result.error.serverCode;    // 'NOT_FOUND', 'FORBIDDEN', etc. (from server response)
result.error.message;       // Error message
```

Specific error classes exist for common status codes:

- `FetchBadRequestError` — 400
- `FetchUnauthorizedError` — 401
- `FetchForbiddenError` — 403
- `FetchNotFoundError` — 404
- `FetchConflictError` — 409
- `FetchGoneError` — 410
- `FetchUnprocessableEntityError` — 422
- `FetchRateLimitError` — 429
- `FetchInternalServerError` — 500
- `FetchServiceUnavailableError` — 503

### Timeout Errors

**`FetchTimeoutError`** — Request took too long

```typescript
const result = await client.get('/slow-endpoint', { timeout: 5000 });
// result.error instanceof FetchTimeoutError → true
// result.error.code → 'TimeoutError'
```

### Parse Errors

**`ParseError`** — Response JSON was invalid

```typescript
// Server returned invalid JSON
result.error instanceof ParseError → true;
result.error.path;     // Where parsing failed (e.g., 'users.0.name')
result.error.value;   // The value that failed to parse
```

### Validation Errors

**`FetchValidationError`** — Request validation failed

```typescript
// Client-side or server-side validation failed
result.error instanceof FetchValidationError → true;
result.error.errors; // Array of { path: string, message: string }
result.error.errors[0].path;     // e.g., 'email'
result.error.errors[0].message;  // e.g., 'Invalid email format'
```

## Common Patterns

### Fetching Data with Error Handling

```typescript
import { matchError } from '@vertz/errors';

async function fetchUserProfile(userId: string) {
  const result = await userSdk.get(userId);
  
  if (!result.ok) {
    return matchError(result.error, {
      NetworkError: () => ({ type: 'network' as const }),
      HttpError: (e) => {
        if (e.serverCode === 'NOT_FOUND') return { type: 'not_found' as const };
        if (e.serverCode === 'FORBIDDEN') return { type: 'forbidden' as const };
        return { type: 'server' as const, status: e.status };
      },
      TimeoutError: () => ({ type: 'timeout' as const }),
      ParseError: () => ({ type: 'parse' as const }),
      ValidationError: () => ({ type: 'validation' as const, errors: [] }),
    });
  }
  
  return { type: 'success' as const, user: result.data };
}
```

### Form Submission with Validation Errors

```typescript
function UserForm() {
  const [errors, setErrors] = useState<FieldError[]>([]);
  
  async function handleSubmit(data: CreateUserInput) {
    const result = await userSdk.create(data);
    
    if (!result.ok) {
      return matchError(result.error, {
        NetworkError: () => setErrors([{ path: '_root', message: 'Network error' }]),
        HttpError: (e) => {
          if (e.serverCode === 'EMAIL_EXISTS') {
            setErrors([{ path: 'email', message: 'Email already in use' }]);
          } else {
            setErrors([{ path: '_root', message: e.message }]);
          }
        },
        TimeoutError: () => setErrors([{ path: '_root', message: 'Request timed out' }]),
        ParseError: () => setErrors([{ path: '_root', message: 'Invalid response' }]),
        ValidationError: (e) => setErrors(e.errors),
      });
    }
    
    // Success — redirect or show success
    router.push(`/users/${result.data.id}`);
  }
  
  // ... render form
}
```

### Retry Logic with Specific Error Types

```typescript
async function fetchWithRetry<T>(
  operation: () => Promise<Result<T, FetchError>>,
  maxRetries = 3
): Promise<Result<T, FetchError>> {
  let lastError: FetchError | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await operation();
    
    if (result.ok) {
      return result;
    }
    
    lastError = result.error;
    
    // Only retry on network errors and timeouts
    const shouldRetry = matchError(result.error, {
      NetworkError: () => true,
      TimeoutError: () => true,
      HttpError: (e) => e.status >= 500, // Retry server errors
      ParseError: () => false,
      ValidationError: () => false,
    });
    
    if (!shouldRetry) {
      return result;
    }
    
    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  return err(lastError!);
}
```

### Global Error Handling

```typescript
// In your app's error boundary or root component
import { matchError, FetchErrorType } from '@vertz/errors';

function GlobalErrorHandler({ error, reset }: { error: FetchErrorType; reset: () => void }) {
  const errorComponent = matchError(error, {
    NetworkError: (e) => (
      <ErrorCard title="Network Error" message={e.message}>
        <Button onClick={reset}>Try Again</Button>
      </ErrorCard>
    ),
    
    HttpError: (e) => {
      if (e.serverCode === 'NOT_FOUND') {
        return <NotFoundPage />;
      }
      if (e.serverCode === 'FORBIDDEN' || e.status === 403) {
        return <AccessDeniedPage />;
      }
      return (
        <ErrorCard title="Server Error" message={`${e.status}: ${e.message}`}>
          <Button onClick={reset}>Try Again</Button>
        </ErrorCard>
      );
    },
    
    TimeoutError: (e) => (
      <ErrorCard title="Request Timeout" message={e.message}>
        <Button onClick={reset}>Try Again</Button>
      </ErrorCard>
    ),
    
    ParseError: (e) => (
      <ErrorCard title="Data Error" message={`Could not process: ${e.path}`} />
    ),
    
    ValidationError: (e) => (
      <ValidationErrors errors={e.errors} onFix={reset} />
    ),
  });
  
  return errorComponent;
}
```

## Streaming Endpoints

Streaming handlers **throw** instead of returning `Result`. Once a stream has started sending data to the client, there's no way to "take back" what was sent and return an error envelope. The stream is the response.

```typescript
// Streaming handler — throws on error, no Result wrapper
app.get('/events', (ctx) => {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of subscribe(ctx)) {
          controller.enqueue(JSON.stringify(event) + '\n');
        }
        controller.close();
      } catch (error) {
        // Error mid-stream — close the connection.
        // The client sees the stream end unexpectedly.
        controller.error(error);
      }
    },
  });
});
```

For endpoints that might fail **before** streaming starts, validate early and throw before creating the stream:

```typescript
app.get('/events/:channel', (ctx) => {
  // Validate before streaming — this returns a proper error response
  const channel = ctx.params.channel;
  if (!isValidChannel(channel)) {
    throw new BadRequestException('Invalid channel');
  }

  // From here on, we're committed to the stream
  return new ReadableStream({ ... });
});
```

> **Rule of thumb:** If an error can happen before the first byte is sent, use `Result`. If it can happen mid-stream, throw (or close the stream). Never wrap a streaming response in `Result`.

## serverCode — Semantic Server Errors

HTTP status codes are coarse — a 404 could mean "user not found", "post not found", or "route not found". The `serverCode` field on `HttpError` carries a **semantic error code** from the server, giving clients fine-grained control:

```typescript
const result = await userSdk.update(userId, data);

if (!result.ok) {
  matchError(result.error, {
    HttpError: (e) => {
      switch (e.serverCode) {
        case 'NOT_FOUND':
          return showToast('User not found');
        case 'EMAIL_EXISTS':
          form.setFieldError('email', 'Already in use');
          return;
        case 'FORBIDDEN':
          return redirectTo('/login');
        default:
          return showToast(`Error: ${e.message}`);
      }
    },
    NetworkError: () => showToast('Network error — check your connection'),
    TimeoutError: () => showToast('Request timed out'),
    ParseError: () => showToast('Unexpected server response'),
    ValidationError: (e) => {
      for (const { path, message } of e.errors) {
        form.setFieldError(path, message);
      }
    },
  });
}
```

### How serverCode flows

1. Server handler returns `err(status, { code: 'EMAIL_EXISTS', message: '...' })`
2. Vertz serializes the error body as JSON with the status code
3. Client SDK receives the response and creates an `HttpError`
4. `HttpError.serverCode` is extracted from the response body's `code` field
5. Client code matches on `e.serverCode` for specific handling

### Defining server codes

Server codes are just strings — there's no enum. Convention: use UPPER_SNAKE_CASE matching your entity error codes:

```typescript
// Server-side handler
export function updateUser(ctx: HandlerCtx) {
  const user = await db.findById(ctx.params.id);
  if (!user) return err(404, { code: 'NOT_FOUND', message: 'User not found' });

  const existing = await db.findByEmail(ctx.body.email);
  if (existing && existing.id !== user.id) {
    return err(409, { code: 'EMAIL_EXISTS', message: 'Email already in use' });
  }

  const updated = await db.update(user.id, ctx.body);
  return ok(updated);
}
```

## Result Utility Functions

### map — Transform the Success Value

```typescript
import { map, ok } from '@vertz/errors';

const result = ok({ user: { name: 'Alice' } });
const nameResult = map(result, ({ user }) => user.name);
// nameResult = Ok<'Alice'>
```

### flatMap — Chain Operations

```typescript
import { flatMap, ok } from '@vertz/errors';

const result = await flatMap(
  await userSdk.get(userId),
  (user) => profileSdk.get(user.profileId)
);
// result = Result<Profile, FetchError>
```

### unwrapOr — Provide Default

```typescript
import { unwrapOr } from '@vertz/errors';

const user = unwrapOr(result, { id: 'guest', name: 'Guest User' });
```

### unwrap — Panic on Error

Use only in tests or when failure is truly exceptional:

```typescript
import { unwrap } from '@vertz/errors';

// In tests
const user = unwrap(result);

// In scripts
const config = unwrap(parseConfig());
```

## Type Safety

The errors-as-values pattern provides compile-time guarantees:

1. **You can't forget to check** — Accessing `.data` without checking `.ok` is a type error
2. **You can't miss error cases** — `matchError()` requires handlers for all error types
3. **Error types flow correctly** — Server errors reach the client with full type information

```typescript
// This won't compile — you're accessing .data without checking .ok
const name = result.data.name;
//                ^^^^^ Property 'ok' must be checked before accessing 'data'

// This also won't compile — you're missing a handler
matchError(result.error, {
  NetworkError: (e) => ...,
  HttpError: (e) => ...,
  // Missing: TimeoutError, ParseError, ValidationError
  // Error: Type '{ NetworkError: ...; HttpError: ...; }' is missing the following properties
});
```
