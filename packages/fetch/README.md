# @vertz/fetch

Type-safe HTTP client for Vertz with error-as-value semantics, automatic retries, streaming support, and flexible authentication strategies.

## Features

- **Error-as-value** — Returns `Result<T, Error>` instead of throwing, for predictable error handling
- **Type-safe requests** — Full TypeScript inference for request/response types
- **Automatic retries** — Exponential/linear backoff with configurable retry logic
- **Streaming support** — Server-Sent Events (SSE) and newline-delimited JSON (NDJSON)
- **Flexible authentication** — Bearer tokens, Basic auth, API keys, or custom strategies
- **Request/response hooks** — Intercept and transform at every stage
- **Typed error hierarchy** — Specific error classes for all HTTP status codes
- **Timeout management** — Automatic timeout with AbortSignal support

## Installation

```bash
npm install @vertz/fetch
```

## Quick Start

```typescript
import { FetchClient, isOk, isErr, unwrap } from '@vertz/fetch';

// Create a client with base configuration
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  headers: {
    'User-Agent': 'MyApp/1.0',
  },
  timeoutMs: 5000,
});

// Make a typed GET request — returns Result<T, FetchError>
const result = await client.get<{ id: number; name: string }>('/users/1');

if (isOk(result)) {
  console.log(result.data.data.name); // Fully typed!
}

// Or unwrap directly (throws if error)
const { data } = unwrap(await client.get<{ id: number; name: string }>('/users/1'));
console.log(data.name);

// POST with body
const newUser = await client.post<{ id: number }>('/users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// Query parameters
const users = await client.get<{ users: Array<{ id: number }> }>('/users', {
  query: { page: 1, limit: 10 },
});
```

## API Reference

### `FetchClient`

The main client class for making HTTP requests.

#### Constructor

```typescript
new FetchClient(config: FetchClientConfig)
```

**Config options:**

```typescript
interface FetchClientConfig {
  /** Base URL for all requests (e.g., 'https://api.example.com') */
  baseURL?: string;

  /** Default headers added to every request */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Retry configuration */
  retry?: {
    retries: number;
    strategy: 'exponential' | 'linear' | ((attempt: number, baseBackoff: number) => number);
    backoffMs: number;
    retryOn: number[]; // Status codes to retry (default: [429, 500, 502, 503, 504])
    retryOnError?: (error: Error) => boolean;
  };

  /** Lifecycle hooks */
  hooks?: {
    beforeRequest?: (request: Request) => void | Promise<void>;
    afterResponse?: (response: Response) => void | Promise<void>;
    onError?: (error: Error) => void | Promise<void>;
    beforeRetry?: (attempt: number, error: Error) => void | Promise<void>;
    onStreamStart?: () => void;
    onStreamChunk?: (chunk: unknown) => void;
    onStreamEnd?: () => void;
  };

  /** Authentication strategies (applied in order) */
  authStrategies?: AuthStrategy[];

  /** Custom fetch implementation (default: globalThis.fetch) */
  fetch?: typeof fetch;

  /** Credentials mode */
  credentials?: RequestCredentials;
}
```

#### Methods

##### `request<T>(method, path, options?)`

Make a standard HTTP request with JSON response.

```typescript
const result = await client.request<User>('GET', '/users/1');

if (isOk(result)) {
  const { data, status, headers } = result.data;
}
```

##### Convenience methods

```typescript
client.get<T>(path, options?)              // GET request
client.post<T>(path, body?, options?)      // POST request
client.put<T>(path, body?, options?)       // PUT request
client.patch<T>(path, body?, options?)     // PATCH request
client.delete<T>(path, options?)           // DELETE request
```

**Options:**

```typescript
interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown; // Automatically JSON-stringified
  signal?: AbortSignal;
}
```

**Returns:** `Promise<Result<{ data: T; status: number; headers: Headers }, FetchError>>`

On success, the result is `Ok` with `data`, `status`, and `headers`. On failure, the result is `Err` with a typed `FetchError`.

##### `requestStream<T>(options)`

Stream responses using SSE or NDJSON format. Unlike `request()`, streaming errors are thrown (not wrapped in `Result`) since you can't return a `Result` from an async generator mid-stream.

```typescript
for await (const chunk of client.requestStream<LogEntry>({
  method: 'POST',
  path: '/logs/stream',
  format: 'sse', // or 'ndjson'
  body: { query: 'error' },
})) {
  console.log(chunk); // Typed as LogEntry
}
```

**Options:**

```typescript
interface StreamingRequestOptions {
  method: string;
  path: string;
  format: 'sse' | 'ndjson';
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}
```

### Authentication Strategies

Configure one or more authentication strategies. They're applied in order.

#### Bearer Token

```typescript
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  authStrategies: [
    {
      type: 'bearer',
      token: 'your-access-token',
    },
  ],
});

// Or with async token retrieval
const client = new FetchClient({
  authStrategies: [
    {
      type: 'bearer',
      token: async () => await getAccessToken(),
    },
  ],
});
```

#### Basic Auth

```typescript
const client = new FetchClient({
  authStrategies: [
    {
      type: 'basic',
      username: 'user',
      password: 'pass',
    },
  ],
});
```

#### API Key

```typescript
const client = new FetchClient({
  authStrategies: [
    {
      type: 'apiKey',
      key: 'your-api-key',
      location: 'header', // or 'query'
      name: 'X-API-Key', // Header name or query param name
    },
  ],
});
```

#### Custom Strategy

```typescript
const client = new FetchClient({
  authStrategies: [
    {
      type: 'custom',
      apply: async (request) => {
        // Modify the request (e.g., add custom headers)
        request.headers.set('X-Custom-Auth', await getCustomToken());
        return request;
      },
    },
  ],
});
```

### Error Handling

All requests return a `Result<T, FetchError>` — errors are values, not exceptions. Use `isOk()`/`isErr()` to check, or `unwrap()` to extract the value (throws on error).

```typescript
import { FetchClient, isOk, isErr, unwrap, matchError } from '@vertz/fetch';

const result = await client.get<User>('/users/999');

// Pattern 1: Check with isOk/isErr
if (isErr(result)) {
  console.error('Request failed:', result.error.message);
  console.error('Status:', result.error.status);
} else {
  console.log('User:', result.data.data);
}

// Pattern 2: Unwrap (throws if error)
const { data: user } = unwrap(await client.get<User>('/users/1'));

// Pattern 3: Unwrap with default
const { data: user } = unwrapOr(await client.get<User>('/users/1'), {
  data: defaultUser,
  status: 0,
  headers: new Headers(),
});

// Pattern 4: matchError for specific error handling
if (isErr(result)) {
  matchError(result.error, {
    NotFound: (err) => console.error('User not found'),
    RateLimit: (err) => console.error('Rate limited, slow down'),
    Unauthorized: (err) => console.error('Need to re-authenticate'),
    _: (err) => console.error('Unexpected error:', err.message),
  });
}
```

**Available error classes:**

| Class                      | Status | Description                  |
| -------------------------- | ------ | ---------------------------- |
| `BadRequestError`          | 400    | Invalid request              |
| `UnauthorizedError`        | 401    | Authentication required      |
| `ForbiddenError`           | 403    | Insufficient permissions     |
| `NotFoundError`            | 404    | Resource not found           |
| `ConflictError`            | 409    | Resource conflict            |
| `GoneError`                | 410    | Resource no longer available |
| `UnprocessableEntityError` | 422    | Validation failed            |
| `RateLimitError`           | 429    | Too many requests            |
| `InternalServerError`      | 500    | Server error                 |
| `ServiceUnavailableError`  | 503    | Service down                 |

All error classes extend `FetchError`:

```typescript
class FetchError extends Error {
  readonly status: number;
  readonly body?: unknown; // Parsed response body (if available)
}
```

### Retry Configuration

Automatic retries with exponential backoff:

```typescript
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  retry: {
    retries: 3, // Retry up to 3 times
    strategy: 'exponential', // 100ms, 200ms, 400ms, ...
    backoffMs: 100, // Base delay
    retryOn: [429, 500, 502, 503, 504], // Status codes to retry
  },
  hooks: {
    beforeRetry: (attempt, error) => {
      console.log(`Retry attempt ${attempt} after error:`, error.message);
    },
  },
});
```

Custom backoff strategy:

```typescript
const client = new FetchClient({
  retry: {
    retries: 5,
    strategy: (attempt, baseBackoff) => {
      // Custom: jittered exponential backoff
      const exponential = baseBackoff * 2 ** (attempt - 1);
      const jitter = Math.random() * 0.3 * exponential;
      return exponential + jitter;
    },
    backoffMs: 100,
    retryOn: [429, 500, 502, 503, 504],
  },
});
```

### Request Lifecycle Hooks

Intercept requests and responses at every stage:

```typescript
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  hooks: {
    beforeRequest: async (request) => {
      console.log('Sending:', request.method, request.url);
    },
    afterResponse: async (response) => {
      console.log('Received:', response.status);
    },
    onError: async (error) => {
      console.error('Request failed:', error.message);
      // Send to error tracking service
      await sendToSentry(error);
    },
    beforeRetry: async (attempt, error) => {
      console.log(`Retry ${attempt} after:`, error.message);
    },
  },
});
```

### Streaming Hooks

Monitor streaming responses:

```typescript
const client = new FetchClient({
  hooks: {
    onStreamStart: () => console.log('Stream started'),
    onStreamChunk: (chunk) => console.log('Received chunk:', chunk),
    onStreamEnd: () => console.log('Stream ended'),
  },
});

for await (const event of client.requestStream({
  method: 'GET',
  path: '/events',
  format: 'sse',
})) {
  // Process event
}
```

## Integration with @vertz/schema

Use `@vertz/schema` for runtime validation of request/response data:

```typescript
import { FetchClient, isOk, unwrap } from '@vertz/fetch';
import { s } from '@vertz/schema';

// Define schemas
const UserSchema = s.object({
  id: s.number(),
  name: s.string(),
  email: s.email(),
  createdAt: s.string().datetime(),
});

const client = new FetchClient({
  baseURL: 'https://api.example.com',
  hooks: {
    afterResponse: async (response) => {
      // Validate responses in development
      if (process.env.NODE_ENV === 'development') {
        const data = await response.clone().json();
        const parsed = UserSchema.safeParse(data);
        if (!parsed.success) {
          console.error('Response validation failed:', parsed.error);
        }
      }
    },
  },
});

// Type-safe request with Result handling
const result = await client.get<typeof UserSchema._output>('/users/1');

if (isOk(result)) {
  const user = result.data.data; // Typed as UserSchema output
  console.log(user.name);
}

// Or unwrap and validate explicitly
const { data } = unwrap(await client.get<unknown>('/users/1'));
const user = UserSchema.parse(data); // Throws if invalid
```

## Advanced Examples

### Timeout and Cancellation

```typescript
// Built-in timeout via config
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  timeoutMs: 5000, // 5 second timeout for all requests
});

// Per-request cancellation with AbortController
const controller = new AbortController();
setTimeout(() => controller.abort(), 3000);

const result = await client.get('/slow-endpoint', {
  signal: controller.signal,
});

if (isErr(result)) {
  // FetchTimeoutError for timeouts, FetchNetworkError for aborts
  console.error(result.error.message);
}
```

### Multiple Auth Strategies

Apply multiple strategies in sequence (e.g., API key + Bearer token):

```typescript
const client = new FetchClient({
  authStrategies: [
    { type: 'apiKey', key: 'api-key', location: 'header', name: 'X-API-Key' },
    { type: 'bearer', token: async () => await getAccessToken() },
  ],
});

// Both headers will be set:
// X-API-Key: api-key
// Authorization: Bearer <token>
```

### Custom Fetch Implementation

Use a custom fetch implementation (e.g., for testing):

```typescript
const client = new FetchClient({
  fetch: async (request) => {
    // Custom logic (e.g., mock responses, logging)
    console.log('Custom fetch:', request.url);
    return globalThis.fetch(request);
  },
});
```

## Best Practices

1. **Reuse client instances** — Create one client per base URL, not per request
2. **Use typed responses** — Always specify the response type for better IDE support
3. **Handle results explicitly** — Check `isOk()`/`isErr()` instead of try/catch
4. **Use `matchError` for branching** — Exhaustive error handling with pattern matching
5. **Configure retries wisely** — Use exponential backoff for transient failures
6. **Add request logging in development** — Use `beforeRequest` hook for debugging
7. **Validate responses in development** — Use `@vertz/schema` + `afterResponse` hook
8. **Use streaming for large responses** — `requestStream` is more memory-efficient

## License

MIT
