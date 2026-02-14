# @vertz/fetch

Type-safe HTTP client for Vertz with automatic retries, streaming support, and flexible authentication strategies.

## Features

- **Type-safe requests** — Full TypeScript inference for request/response types
- **Automatic retries** — Exponential/linear backoff with configurable retry logic
- **Streaming support** — Server-Sent Events (SSE) and newline-delimited JSON (NDJSON)
- **Flexible authentication** — Bearer tokens, Basic auth, API keys, or custom strategies
- **Request/response hooks** — Intercept and transform at every stage
- **Error handling** — Typed error classes for all HTTP status codes
- **Timeout management** — Automatic timeout with AbortSignal support

## Installation

```bash
npm install @vertz/fetch
```

## Quick Start

```typescript
import { FetchClient } from '@vertz/fetch';

// Create a client with base configuration
const client = new FetchClient({
  baseURL: 'https://api.example.com',
  headers: {
    'User-Agent': 'MyApp/1.0',
  },
  timeoutMs: 5000,
});

// Make a typed GET request
const response = await client.request<{ id: number; name: string }>('GET', '/users/1');
console.log(response.data.name); // Fully typed!

// POST with body
const newUser = await client.request<{ id: number }>('POST', '/users', {
  body: { name: 'Alice', email: 'alice@example.com' },
});

// Query parameters
const users = await client.request<{ users: Array<{ id: number }> }>('GET', '/users', {
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
const response = await client.request<User>('GET', '/users/1');
const { data, status, headers } = response;
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

**Returns:**

```typescript
interface FetchResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}
```

##### `requestStream<T>(options)`

Stream responses using SSE or NDJSON format.

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

All non-2xx responses throw typed error classes:

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  FetchError, // Base class
} from '@vertz/fetch';

try {
  await client.request('GET', '/users/999');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('User not found:', error.statusText);
    console.error('Response body:', error.body);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited, retry after:', error.statusText);
  }
  throw error;
}
```

All error classes extend `FetchError` with these properties:

```typescript
class FetchError extends Error {
  status: number;
  statusText: string;
  body?: unknown; // Parsed response body (if available)
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
  format: 'sse' 
})) {
  // Process event
}
```

## Integration with @vertz/schema

Use `@vertz/schema` for runtime validation of request/response data:

```typescript
import { FetchClient } from '@vertz/fetch';
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
        try {
          UserSchema.parse(data);
        } catch (error) {
          console.error('Response validation failed:', error);
        }
      }
    },
  },
});

// Type-safe request with schema validation
const response = await client.request<typeof UserSchema._output>('GET', '/users/1');

// Or validate explicitly
const data = await client.request<unknown>('GET', '/users/1');
const user = UserSchema.parse(data.data); // Throws if invalid
```

## Advanced Examples

### Timeout and Cancellation

```typescript
const controller = new AbortController();

// Cancel after 3 seconds
setTimeout(() => controller.abort(), 3000);

try {
  const response = await client.request('GET', '/slow-endpoint', {
    signal: controller.signal,
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request cancelled');
  }
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
3. **Handle errors explicitly** — Catch specific error classes for better error handling
4. **Configure retries wisely** — Use exponential backoff for transient failures
5. **Add request logging in development** — Use `beforeRequest` hook for debugging
6. **Validate responses in development** — Use `@vertz/schema` + `afterResponse` hook
7. **Use streaming for large responses** — `requestStream` is more memory-efficient

## License

MIT
