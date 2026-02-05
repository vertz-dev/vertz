# @vertz/testing — Implementation Plan

## Overview

Complete rewrite of `@vertz/testing` from scratch. The legacy implementation (decorator-based, Fastify-dependent, class-oriented) is replaced with a functional, builder-pattern approach that mirrors the production `@vertz/core` API.

All code is new. The legacy package serves as reference for patterns only.

See also: [Testing Design](./vertz-testing-design.md), [Core Implementation](./vertz-core-implementation.md), [Core API Design](./vertz-core-api-design.md), [Schema Design](./vertz-schema-design.md), [Features](./vertz-features.md).

---

## Architectural Decisions

| Decision | Choice |
|----------|--------|
| Package location | `packages/testing/` — separate from `@vertz/core` |
| Public API surface | `vertz` namespace re-export with `.testing` attached |
| Dependencies | `@vertz/core` (workspace), `@vertz/schema` (workspace) — zero external runtime deps |
| Peer dependencies | None (vitest is used directly, no wrapper) |
| Test app execution | No HTTP server — synthetic `Request` through the same handler pipeline |
| Request builder | Thenable builder pattern — `await` triggers execution, no `.send()` |
| Mock scope | App-level (all requests) + per-request overrides (single request) |
| Mock resolution | By reference — `.mock(dbService, ...)` not `.mock('dbService', ...)` |
| Middleware mocking | Bypass entirely — mocked result injected directly into state |
| Response validation | Always on in test mode — validates handler return against response schema |
| Service unit testing | `createTestService()` — same builder pattern with `.mock()`, `.options()`, `.env()` |
| Build toolchain | Bunup (consistent with all packages) |
| Type safety | Typed route strings, typed request/response, typed mock shapes |
| ESM only | `"type": "module"` |

---

## Package Structure

```
packages/testing/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts                           # Public API: re-exports vertz with testing namespace
│   ├── vertz-testing.ts                   # The testing namespace object
│   │
│   ├── types/
│   │   ├── index.ts                       # Re-exports all types
│   │   ├── test-app.ts                    # TestAppBuilder, TestApp types
│   │   ├── test-request.ts               # RequestBuilder, RequestOptions types
│   │   ├── test-response.ts              # TestResponse, SuccessResponse, ErrorResponse types
│   │   ├── test-service.ts               # TestServiceBuilder types
│   │   ├── mock.ts                        # MockMap, MiddlewareMockMap, DeepPartial types
│   │   └── __tests__/
│   │       └── type-inference.test.ts     # Type-level tests (expectTypeOf)
│   │
│   ├── test-app/
│   │   ├── index.ts
│   │   ├── test-app-builder.ts            # vertz.testing.createApp() and builder chain
│   │   ├── test-app-runner.ts             # Internal: wire mocks, build handler, execute requests
│   │   ├── mock-registry.ts              # Stores app-level and per-request mock overrides
│   │   └── __tests__/
│   │       ├── test-app-builder.test.ts
│   │       └── test-app-runner.test.ts
│   │
│   ├── request/
│   │   ├── index.ts
│   │   ├── request-builder.ts             # Thenable builder with .mock(), .mockMiddleware()
│   │   ├── request-factory.ts             # Creates synthetic Request objects
│   │   └── __tests__/
│   │       ├── request-builder.test.ts
│   │       └── request-factory.test.ts
│   │
│   ├── response/
│   │   ├── index.ts
│   │   ├── response-parser.ts             # Converts Response to TestResponse
│   │   ├── response-validator.ts          # Validates handler return against response schema
│   │   └── __tests__/
│   │       ├── response-parser.test.ts
│   │       └── response-validator.test.ts
│   │
│   ├── mocks/
│   │   ├── index.ts
│   │   ├── service-mock.ts               # Service mock resolution and type enforcement
│   │   ├── middleware-mock.ts             # Middleware mock bypass and result injection
│   │   └── __tests__/
│   │       ├── service-mock.test.ts
│   │       └── middleware-mock.test.ts
│   │
│   ├── test-service/
│   │   ├── index.ts
│   │   ├── test-service-builder.ts        # vertz.testing.createService() and builder chain
│   │   └── __tests__/
│   │       └── test-service-builder.test.ts
│   │
│   └── env/
│       ├── index.ts
│       ├── test-env.ts                    # Override env for test context (no .env file loading)
│       └── __tests__/
│           └── test-env.test.ts
```

---

## The `vertz` Re-export with Testing Namespace

`@vertz/testing` re-exports the `vertz` namespace from `@vertz/core` and attaches the `testing` namespace. Users import `vertz` from `@vertz/testing` instead of `@vertz/core` in test files:

```typescript
// src/vertz-testing.ts
import { vertz as coreVertz } from '@vertz/core';
import { createTestApp } from './test-app/test-app-builder';
import { createTestService } from './test-service/test-service-builder';

export const vertz = {
  ...coreVertz,
  testing: {
    createApp: createTestApp,
    createService: createTestService,
  },
} as const;
```

```typescript
// src/index.ts
export { vertz } from './vertz-testing';

// Re-export all core types for convenience — users don't need to import from @vertz/core
export type * from '@vertz/core';

// Export testing-specific types
export type {
  TestResponse,
  SuccessResponse,
  ErrorResponse,
} from './types/test-response';
export type { TestAppBuilder } from './types/test-app';
export type { RequestBuilder } from './types/test-request';
export type { TestServiceBuilder } from './types/test-service';
```

---

## Key Implementation Details

### 1. TestResponse Type

The response from test requests uses a discriminated union based on `ok`:

```typescript
// src/types/test-response.ts
export interface SuccessResponse<TBody> {
  status: number;
  headers: Headers;
  body: TBody;
  ok: true;
}

export interface ErrorResponse {
  status: number;
  headers: Headers;
  body: {
    message: string;
    code: string;
    details?: unknown;
  };
  ok: false;
}

export type TestResponse<TBody> = SuccessResponse<TBody> | ErrorResponse;
```

`res.ok` is `true` for 2xx status codes, `false` otherwise. TypeScript narrows `res.body` based on the check — no manual casting needed.

### 2. Mock Types

Mocks are typed to match the service's public API or middleware's `provides` schema:

```typescript
// src/types/mock.ts
import type { Infer } from '@vertz/schema';

/**
 * DeepPartial allows partial mocking of service methods.
 * Only the methods you need to mock in a specific test must be provided.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * ServiceMockEntry stores a service reference and its mock implementation.
 * The mock shape is typed as DeepPartial of the service's public API.
 */
export interface ServiceMockEntry<TService = unknown> {
  ref: TService;
  impl: DeepPartial<TService>;
}

/**
 * MiddlewareMockEntry stores a middleware reference and its provides result.
 * The result shape is typed to match the middleware's provides schema.
 */
export interface MiddlewareMockEntry<TProvides = unknown> {
  ref: unknown;
  result: TProvides;
}

/**
 * MockRegistry holds all app-level and per-request mock overrides.
 */
export interface MockRegistry {
  services: Map<unknown, unknown>;       // serviceRef → mock implementation
  middlewares: Map<unknown, unknown>;     // middlewareRef → provides result
}
```

### 3. TestAppBuilder — Builder Pattern

The test app builder mirrors the production `vertz.app()` builder with additions for mocking:

```typescript
// src/test-app/test-app-builder.ts
import type { MockRegistry } from '../types/mock';
import type { TestResponse } from '../types/test-response';

interface TestAppConfig {
  env: Record<string, unknown>;
  mocks: MockRegistry;
  modules: Array<{ module: unknown; options?: Record<string, unknown> }>;
}

class TestAppBuilder<TRoutes = never> {
  private config: TestAppConfig;

  constructor() {
    this.config = {
      env: {},
      mocks: {
        services: new Map(),
        middlewares: new Map(),
      },
      modules: [],
    };
  }

  /**
   * Override environment variables for the test context.
   * No .env file loading — values are provided directly.
   */
  env<TEnv extends Record<string, unknown>>(env: TEnv): TestAppBuilder<TRoutes> {
    this.config.env = { ...this.config.env, ...env };
    return this;
  }

  /**
   * Register an app-level service mock.
   * The mock shape is typed to match the service's public API (DeepPartial).
   * App-level mocks apply to all requests unless overridden per-request.
   */
  mock<TService>(
    serviceRef: TService,
    impl: DeepPartial<TService>,
  ): TestAppBuilder<TRoutes> {
    this.config.mocks.services.set(serviceRef, impl);
    return this;
  }

  /**
   * Register an app-level middleware mock.
   * When mocked, the middleware is bypassed entirely — the provides result
   * is injected directly into the middleware state.
   */
  mockMiddleware<TMiddleware extends { __provides: unknown }>(
    middlewareRef: TMiddleware,
    result: TMiddleware['__provides'],
  ): TestAppBuilder<TRoutes> {
    this.config.mocks.middlewares.set(middlewareRef, result);
    return this;
  }

  /**
   * Register a module with optional options.
   * Options are validated against the module's options schema.
   * Returns a new builder with the module's routes added to TRoutes.
   */
  register<TModule>(
    module: TModule,
    options?: Record<string, unknown>,
  ): TestAppBuilder<TRoutes /* | TModule routes */> {
    this.config.modules.push({ module, options });
    return this as any;
  }

  /**
   * HTTP method helpers — return a RequestBuilder (thenable).
   * The route string is typed to only allow registered routes for that method.
   */
  get<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<ResponseType<TRoute>>> {
    return this.createRequestBuilder('GET', route, options);
  }

  post<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<ResponseType<TRoute>>> {
    return this.createRequestBuilder('POST', route, options);
  }

  put<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<ResponseType<TRoute>>> {
    return this.createRequestBuilder('PUT', route, options);
  }

  patch<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<ResponseType<TRoute>>> {
    return this.createRequestBuilder('PATCH', route, options);
  }

  delete<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<ResponseType<TRoute>>> {
    return this.createRequestBuilder('DELETE', route, options);
  }

  head<TRoute extends string>(
    route: TRoute,
    options?: RequestOptions<TRoute>,
  ): RequestBuilder<TestResponse<never>> {
    return this.createRequestBuilder('HEAD', route, options);
  }

  private createRequestBuilder(
    method: string,
    route: string,
    options?: RequestOptions<string>,
  ): RequestBuilder<any> {
    return new RequestBuilder(this.config, method, route, options);
  }
}

export function createTestApp(): TestAppBuilder {
  return new TestAppBuilder();
}
```

### 4. RequestBuilder — Thenable Pattern

The request builder is thenable — `await` triggers execution. Per-request overrides are chained before `await`:

```typescript
// src/request/request-builder.ts
import type { MockRegistry } from '../types/mock';
import type { TestResponse } from '../types/test-response';

interface RequestOptions<TRoute extends string> {
  params?: Record<string, string>;    // Typed per route
  body?: unknown;                      // Typed per route
  query?: Record<string, unknown>;     // Typed per route
  headers?: Record<string, string>;    // Typed per route (if route defines headers schema)
}

class RequestBuilder<TResponse> implements PromiseLike<TResponse> {
  private requestMocks: MockRegistry;

  constructor(
    private appConfig: TestAppConfig,
    private method: string,
    private route: string,
    private options?: RequestOptions<string>,
  ) {
    // Start with empty per-request overrides
    this.requestMocks = {
      services: new Map(),
      middlewares: new Map(),
    };
  }

  /**
   * Override a service mock for this request only.
   * Takes precedence over app-level mock for the same service.
   */
  mock<TService>(
    serviceRef: TService,
    impl: DeepPartial<TService>,
  ): RequestBuilder<TResponse> {
    this.requestMocks.services.set(serviceRef, impl);
    return this;
  }

  /**
   * Override a middleware mock for this request only.
   * Takes precedence over app-level mock for the same middleware.
   */
  mockMiddleware<TMiddleware extends { __provides: unknown }>(
    middlewareRef: TMiddleware,
    result: TMiddleware['__provides'],
  ): RequestBuilder<TResponse> {
    this.requestMocks.middlewares.set(middlewareRef, result);
    return this;
  }

  /**
   * PromiseLike implementation — `await` triggers request execution.
   * This is the only way to execute a request. No .send() or .execute().
   */
  then<TResult1 = TResponse, TResult2 = never>(
    onfulfilled?: ((value: TResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  /**
   * Internal: executes the request through the handler pipeline.
   */
  private async execute(): Promise<TResponse> {
    // 1. Merge app-level mocks with per-request overrides (per-request wins)
    const mergedMocks = this.mergeMocks(this.appConfig.mocks, this.requestMocks);

    // 2. Build synthetic Request from route, method, options
    const request = buildSyntheticRequest(this.method, this.route, this.options);

    // 3. Pass through the same handler pipeline as production
    //    - Route matching (trie)
    //    - Schema validation (params, body, query, headers)
    //    - Middleware execution (mocked middlewares bypassed, non-mocked run)
    //    - Handler execution
    //    - Response validation (always on in test mode)
    const response = await executeRequest(request, this.appConfig, mergedMocks);

    // 4. Parse Response into TestResponse
    return parseTestResponse(response) as TResponse;
  }

  private mergeMocks(appMocks: MockRegistry, requestMocks: MockRegistry): MockRegistry {
    const merged: MockRegistry = {
      services: new Map([...appMocks.services]),
      middlewares: new Map([...appMocks.middlewares]),
    };

    // Per-request overrides take precedence
    for (const [ref, impl] of requestMocks.services) {
      merged.services.set(ref, impl);
    }
    for (const [ref, result] of requestMocks.middlewares) {
      merged.middlewares.set(ref, result);
    }

    return merged;
  }
}
```

### 5. Synthetic Request Factory

Creates Web Standard `Request` objects from test route/method/options — no HTTP server needed:

```typescript
// src/request/request-factory.ts

/**
 * Builds a synthetic Web Standard Request from test parameters.
 * Replaces :param placeholders in the route with actual param values.
 */
export function buildSyntheticRequest(
  method: string,
  route: string,
  options?: {
    params?: Record<string, string>;
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): Request {
  // 1. Replace :param placeholders with actual values
  let path = route;
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      path = path.replace(`:${key}`, encodeURIComponent(value));
    }
  }

  // 2. Build URL with query parameters
  const url = new URL(path, 'http://localhost');
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // 3. Build headers
  const headers = new Headers(options?.headers);
  if (options?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  // 4. Build request init
  const init: RequestInit = {
    method,
    headers,
  };

  // 5. Add body for methods that support it
  if (options?.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
  }

  return new Request(url.toString(), init);
}
```

### 6. Response Parser

Converts the Web Standard `Response` from the handler pipeline into a `TestResponse`:

```typescript
// src/response/response-parser.ts
import type { TestResponse, SuccessResponse, ErrorResponse } from '../types/test-response';

/**
 * Parses a Web Standard Response into a TestResponse.
 * - 2xx → SuccessResponse with ok: true
 * - Non-2xx → ErrorResponse with ok: false
 */
export async function parseTestResponse<TBody>(
  response: Response,
): Promise<TestResponse<TBody>> {
  const status = response.status;
  const headers = response.headers;
  const ok = status >= 200 && status < 300;

  // Parse body — handle empty responses (204, HEAD, etc.)
  let body: unknown;
  const contentType = response.headers.get('content-type');

  if (status === 204 || response.body === null) {
    body = undefined;
  } else if (contentType?.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (ok) {
    return { status, headers, body, ok: true } as SuccessResponse<TBody>;
  }

  return { status, headers, body, ok: false } as ErrorResponse;
}
```

### 7. Response Validator

In test mode, response validation is always on. This catches handler/schema mismatches that would produce incorrect OpenAPI docs:

```typescript
// src/response/response-validator.ts

/**
 * Validates the handler return value against the route's response schema.
 * Only runs in test mode (always). In production, this is skipped.
 *
 * Throws a descriptive error if the handler return doesn't match the schema:
 *
 *   Response validation failed for GET /users/:id
 *
 *     Unexpected key: "unexpected"
 *     Expected shape: { id: string, name: string, email: string, createdAt: Date }
 */
export function validateResponse(
  method: string,
  route: string,
  responseSchema: unknown, // Schema from @vertz/schema
  handlerResult: unknown,
): void {
  if (!responseSchema) return;

  // Use the schema's safeParse to validate
  const result = (responseSchema as any).safeParse(handlerResult);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue: any) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(
      `Response validation failed for ${method} ${route}\n\n${issues}`,
    );
  }
}
```

### 8. Test App Runner — Internal Wiring

The runner bridges the test builder config with the core handler pipeline. It handles mock injection into the boot executor and middleware runner:

```typescript
// src/test-app/test-app-runner.ts
import type { MockRegistry } from '../types/mock';

interface TestAppRunnerConfig {
  env: Record<string, unknown>;
  modules: Array<{ module: unknown; options?: Record<string, unknown> }>;
}

/**
 * Builds and executes requests through the core handler pipeline.
 *
 * Key differences from production:
 * 1. No HTTP server — receives synthetic Request objects
 * 2. Service mocks injected into boot executor (replace real service instances)
 * 3. Mocked middlewares bypassed — provides result injected directly into state
 * 4. Response validation always enabled
 * 5. Env provided directly — no .env file loading
 */
export class TestAppRunner {
  private handler: ((request: Request) => Promise<Response>) | null = null;

  constructor(private config: TestAppRunnerConfig) {}

  /**
   * Lazily builds the handler on first request.
   *
   * Steps:
   * 1. Create env from direct values (no .env loading)
   * 2. Run boot executor with service mocks replacing real instances
   * 3. Build trie router from registered modules
   * 4. Wire middleware chain with mock awareness
   * 5. Return the handler function
   */
  async getHandler(mocks: MockRegistry): Promise<(request: Request) => Promise<Response>> {
    if (!this.handler) {
      this.handler = await this.buildHandler(mocks);
    }
    return this.handler;
  }

  private async buildHandler(mocks: MockRegistry): Promise<(request: Request) => Promise<Response>> {
    // 1. Override env — bypass vertz.env() file loading, inject test values directly
    const env = this.config.env;

    // 2. Boot services — for each service in the boot sequence:
    //    - If service ref exists in mocks.services → use mock impl instead of real service
    //    - Otherwise → boot normally (onInit → methods)
    //
    // The mock lookup is by reference identity (===), matching how .mock(dbService, impl)
    // passes the actual service definition object.

    // 3. Wire middleware chain — for each middleware in a route's chain:
    //    - If middleware ref exists in mocks.middlewares → skip execution, inject result into state
    //    - Otherwise → execute normally (validate requires, run handler, validate provides)
    //
    // This means non-mocked middlewares still run through the real pipeline,
    // which catches integration issues that pure mocking would miss.

    // 4. Enable response validation — after handler execution, validate return value
    //    against the route's response schema. This is always on in test mode.

    // 5. Build and return the handler function
    // Uses the same internal buildApp/buildHandler from @vertz/core, with hooks
    // for mock injection and response validation.

    return async (request: Request): Promise<Response> => {
      // Delegate to the core handler pipeline with mock overrides
      // Implementation details depend on core's internal API surface
      throw new Error('Not yet implemented');
    };
  }
}
```

### 9. Mock Registry — Scoped Overrides

Manages the two-scope mock system (app-level defaults + per-request overrides):

```typescript
// src/test-app/mock-registry.ts
import type { MockRegistry } from '../types/mock';

/**
 * Creates a new empty MockRegistry.
 */
export function createMockRegistry(): MockRegistry {
  return {
    services: new Map(),
    middlewares: new Map(),
  };
}

/**
 * Merges app-level mocks with per-request overrides.
 * Per-request overrides take precedence for the same reference.
 *
 * For service mocks, per-request overrides are deep-merged with app-level defaults.
 * This allows a test to override only one method of a service while keeping the
 * rest from the app-level mock.
 */
export function mergeMockRegistries(
  appLevel: MockRegistry,
  perRequest: MockRegistry,
): MockRegistry {
  const merged: MockRegistry = {
    services: new Map(appLevel.services),
    middlewares: new Map(appLevel.middlewares),
  };

  // Service mocks: deep merge per-request into app-level
  for (const [ref, impl] of perRequest.services) {
    const existing = merged.services.get(ref);
    if (existing && typeof existing === 'object' && typeof impl === 'object') {
      merged.services.set(ref, deepMerge(existing as object, impl as object));
    } else {
      merged.services.set(ref, impl);
    }
  }

  // Middleware mocks: per-request replaces app-level entirely
  for (const [ref, result] of perRequest.middlewares) {
    merged.middlewares.set(ref, result);
  }

  return merged;
}

/**
 * Deep merge utility for service mock objects.
 * Recursively merges nested objects. Functions (vi.fn()) are replaced, not merged.
 */
function deepMerge(target: object, source: object): object {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const targetValue = (result as any)[key];

    if (
      value !== null &&
      typeof value === 'object' &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      typeof value !== 'function'
    ) {
      (result as any)[key] = deepMerge(targetValue, value);
    } else {
      (result as any)[key] = value;
    }
  }

  return result;
}
```

### 10. Middleware Mock Execution

When a middleware is mocked, it is bypassed entirely. The mock result is injected into the middleware state as if the middleware had executed and returned that value:

```typescript
// src/mocks/middleware-mock.ts

/**
 * Determines whether a middleware should be bypassed (mocked) or executed normally.
 *
 * When bypassed:
 * - The middleware handler is NOT called
 * - The mock result is merged directly into the middleware state
 * - No schema validation on the mock result (trust the test author)
 *
 * When NOT bypassed:
 * - The middleware runs through the normal pipeline
 * - requires/provides schemas are validated
 * - inject dependencies are resolved normally
 */
export function resolveMiddleware(
  middlewareRef: unknown,
  mockedMiddlewares: Map<unknown, unknown>,
): { bypassed: true; result: unknown } | { bypassed: false } {
  const mockResult = mockedMiddlewares.get(middlewareRef);

  if (mockResult !== undefined) {
    return { bypassed: true, result: mockResult };
  }

  return { bypassed: false };
}
```

### 11. Service Mock Resolution

Service mocks replace real service instances in the DI container:

```typescript
// src/mocks/service-mock.ts

/**
 * Resolves a service instance for the test context.
 *
 * If the service reference exists in the mock map, the mock implementation
 * is used instead of booting the real service. This means:
 * - onInit is NOT called for mocked services
 * - methods is NOT called — the mock IS the public API
 * - onDestroy is NOT called
 *
 * The mock shape is DeepPartial — only the methods used in the test
 * need to be provided. Accessing an unmocked method will return undefined,
 * which is caught early by the test (not silently swallowed).
 */
export function resolveService(
  serviceRef: unknown,
  serviceId: string,
  mockedServices: Map<unknown, unknown>,
): { mocked: true; instance: unknown } | { mocked: false } {
  const mockImpl = mockedServices.get(serviceRef);

  if (mockImpl !== undefined) {
    return { mocked: true, instance: mockImpl };
  }

  return { mocked: false };
}
```

### 12. TestServiceBuilder — Unit Testing Services

For complex business logic that benefits from isolated testing. Same builder pattern as the test app:

```typescript
// src/test-service/test-service-builder.ts

/**
 * Builder for unit testing a service in isolation.
 *
 * Usage:
 *   const service = vertz.testing
 *     .createService(authService)
 *     .mock(dbService, mockDb)
 *     .mock(userService, mockUserService)
 *     .options({ maxLoginAttempts: 3 })
 *     .env({ JWT_SECRET: 'test-secret-at-least-32-chars-long' });
 *
 * The builder returns the service's public API directly (the return value
 * of the service's `methods` function), with all mocked dependencies injected.
 */
class TestServiceBuilder<TService, TMethods> {
  private serviceDef: TService;
  private mockedServices: Map<unknown, unknown> = new Map();
  private moduleOptions: Record<string, unknown> = {};
  private envOverrides: Record<string, unknown> = {};

  constructor(serviceDef: TService) {
    this.serviceDef = serviceDef;
  }

  /**
   * Mock a dependency that this service injects.
   */
  mock<TDep>(
    serviceRef: TDep,
    impl: DeepPartial<TDep>,
  ): TestServiceBuilder<TService, TMethods> {
    this.mockedServices.set(serviceRef, impl);
    return this;
  }

  /**
   * Set module options for the service's module context.
   */
  options(opts: Record<string, unknown>): TestServiceBuilder<TService, TMethods> {
    this.moduleOptions = { ...this.moduleOptions, ...opts };
    return this;
  }

  /**
   * Set environment variables for the service's env context.
   */
  env(env: Record<string, unknown>): TestServiceBuilder<TService, TMethods> {
    this.envOverrides = { ...this.envOverrides, ...env };
    return this;
  }

  /**
   * Build the service instance.
   * Called implicitly — the builder itself exposes the service methods
   * via a Proxy that lazily builds on first access.
   *
   * Steps:
   * 1. Resolve all inject dependencies from mocks
   * 2. Build deps object: { options, env, ...resolvedInject }
   * 3. Call service's onInit(deps) if defined
   * 4. Call service's methods(deps, state) to get public API
   * 5. Return the public API
   */
  private build(): TMethods {
    const def = this.serviceDef as any;

    // Resolve inject dependencies
    const resolvedInject: Record<string, unknown> = {};
    if (def.inject) {
      for (const [key, ref] of Object.entries(def.inject)) {
        const mock = this.mockedServices.get(ref);
        if (mock !== undefined) {
          resolvedInject[key] = mock;
        } else {
          throw new Error(
            `Service dependency "${key}" is not mocked. ` +
            `Use .mock(${key}, impl) to provide a mock implementation.`,
          );
        }
      }
    }

    // Build deps
    const deps = {
      options: this.moduleOptions,
      env: this.envOverrides,
      ...resolvedInject,
    };

    // Run onInit if defined
    let state: unknown;
    if (def.onInit) {
      // onInit may be async — for simplicity in unit tests, we assume sync
      // or require the user to await the builder if async init is needed
      state = def.onInit(deps);
    }

    // Call methods to get public API
    return def.methods(deps, state);
  }
}

export function createTestService<TService>(
  serviceDef: TService,
): TestServiceBuilder<TService, /* inferred methods type */> {
  return new TestServiceBuilder(serviceDef);
}
```

### 13. Test Env — No File Loading

In test mode, environment variables are provided directly via `.env()` on the builder. There is no `.env` file loading:

```typescript
// src/env/test-env.ts

/**
 * Creates a test environment object from directly provided values.
 *
 * Unlike production vertz.env(), this does NOT:
 * - Load .env files
 * - Read from process.env
 * - Validate against a schema (the test author controls the values)
 *
 * The returned object is plain — no freeze, no proxy.
 * Tests need to set arbitrary values without immutability constraints.
 */
export function createTestEnv(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return { ...values };
}
```

### 14. Integration with Core — Internal Hook Points

The testing package needs to hook into `@vertz/core`'s internal pipeline. This requires core to expose specific internal APIs (not part of the public API) that testing can use:

```typescript
// Required internal hooks from @vertz/core (to be added to core):

// 1. Boot executor with mock injection
interface BootExecutorOptions {
  /** Map of service refs to mock implementations. Mocked services skip onInit/methods. */
  serviceMocks?: Map<unknown, unknown>;
}

// 2. Middleware runner with mock awareness
interface MiddlewareRunnerOptions {
  /** Map of middleware refs to mock results. Mocked middlewares are bypassed. */
  middlewareMocks?: Map<unknown, unknown>;
}

// 3. App builder in test mode
interface TestModeOptions {
  /** Enable response validation (always true for test mode) */
  validateResponses: true;
  /** Env values provided directly (no .env loading) */
  env: Record<string, unknown>;
  /** Service mocks */
  serviceMocks: Map<unknown, unknown>;
  /** Middleware mocks */
  middlewareMocks: Map<unknown, unknown>;
}
```

Core should expose a `buildHandler` function (or equivalent) that the testing package can use to construct the handler pipeline with mock injection. This is an **internal** API — exported from `@vertz/core/internal` or a barrel export specifically for `@vertz/testing`. It is not part of the public API surface.

```typescript
// @vertz/core internal export for testing
export function buildTestHandler(
  modules: Array<{ module: unknown; options?: Record<string, unknown> }>,
  testMode: TestModeOptions,
): Promise<(request: Request) => Promise<Response>>;
```

---

## package.json

```json
{
  "name": "@vertz/testing",
  "version": "0.1.0",
  "description": "Testing utilities for the Vertz framework",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bunup",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@vertz/core": "workspace:*",
    "@vertz/schema": "workspace:*"
  },
  "devDependencies": {
    "bunup": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Zero runtime deps beyond workspace packages. No vitest peer dependency — vitest is a project-level concern, not a package concern. The testing package uses `@vertz/schema` for response validation but does not wrap or re-export vitest primitives (`vi.fn()` is `vi.fn()`, not `vertz.fn()`).

---

## bunup.config.ts

```typescript
import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
});
```

---

## vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
```

---

## tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "isolatedDeclarations": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

---

## Implementation Phases (TDD)

Each phase follows strict TDD — one test at a time. Write one failing test, implement just enough to pass, refactor, then write the next test.

### Phase 1: Foundation Types

**Files:** `src/types/`

- `TestResponse` type — `SuccessResponse<TBody>` and `ErrorResponse` with `ok` discriminant
- `MockRegistry` type — service and middleware mock maps
- `DeepPartial<T>` utility type — for partial service mocking
- `ServiceMockEntry`, `MiddlewareMockEntry` types
- Type-level tests using `expectTypeOf`:
  - `TestResponse` narrows body based on `ok`
  - `DeepPartial` preserves function types at leaf level
  - `SuccessResponse` body matches generic parameter

**Tests:**
```typescript
// src/types/__tests__/type-inference.test.ts
import { expectTypeOf } from 'vitest';
import type { TestResponse, SuccessResponse, ErrorResponse } from '../test-response';
import type { DeepPartial } from '../mock';

describe('TestResponse type', () => {
  it('narrows body to success type when ok is true', () => {
    type Res = TestResponse<{ id: string; name: string }>;
    const res = {} as Res;
    if (res.ok) {
      expectTypeOf(res.body).toEqualTypeOf<{ id: string; name: string }>();
      expectTypeOf(res).toMatchTypeOf<SuccessResponse<{ id: string; name: string }>>();
    }
  });

  it('narrows body to error type when ok is false', () => {
    type Res = TestResponse<{ id: string }>;
    const res = {} as Res;
    if (!res.ok) {
      expectTypeOf(res.body).toMatchTypeOf<{ message: string; code: string }>();
      expectTypeOf(res).toMatchTypeOf<ErrorResponse>();
    }
  });
});

describe('DeepPartial type', () => {
  it('makes nested object properties optional', () => {
    type Service = {
      user: {
        findUnique: (id: string) => Promise<unknown>;
        findMany: () => Promise<unknown[]>;
      };
    };
    type Partial = DeepPartial<Service>;
    expectTypeOf<Partial>().toMatchTypeOf<{
      user?: {
        findUnique?: (id: string) => Promise<unknown>;
        findMany?: () => Promise<unknown[]>;
      };
    }>();
  });
});
```

### Phase 2: Synthetic Request Factory

**Files:** `src/request/request-factory.ts`

- Build `Request` from method + route + options
- Replace `:param` placeholders with actual values
- Append query parameters to URL
- Set `Content-Type: application/json` when body is present
- Serialize body as JSON
- Handle GET/HEAD (no body)
- Handle empty options

**Tests:**
```typescript
// src/request/__tests__/request-factory.test.ts
describe('buildSyntheticRequest', () => {
  it('creates a GET request with correct method and URL', () => {
    const req = buildSyntheticRequest('GET', '/users');
    expect(req.method).toBe('GET');
    expect(new URL(req.url).pathname).toBe('/users');
  });

  it('replaces :param placeholders with values', () => {
    const req = buildSyntheticRequest('GET', '/users/:id', {
      params: { id: '123' },
    });
    expect(new URL(req.url).pathname).toBe('/users/123');
  });

  it('replaces multiple :param placeholders', () => {
    const req = buildSyntheticRequest('GET', '/users/:userId/posts/:postId', {
      params: { userId: 'u1', postId: 'p2' },
    });
    expect(new URL(req.url).pathname).toBe('/users/u1/posts/p2');
  });

  it('appends query parameters', () => {
    const req = buildSyntheticRequest('GET', '/users', {
      query: { page: 1, limit: 20, search: 'john' },
    });
    const url = new URL(req.url);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('search')).toBe('john');
  });

  it('sets JSON content-type when body is present', () => {
    const req = buildSyntheticRequest('POST', '/users', {
      body: { name: 'Jane' },
    });
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('serializes body as JSON', async () => {
    const req = buildSyntheticRequest('POST', '/users', {
      body: { name: 'Jane', email: 'jane@example.com' },
    });
    const body = await req.json();
    expect(body).toEqual({ name: 'Jane', email: 'jane@example.com' });
  });

  it('does not include body for GET requests', () => {
    const req = buildSyntheticRequest('GET', '/users', {
      body: { name: 'Jane' },
    });
    expect(req.body).toBeNull();
  });

  it('includes custom headers', () => {
    const req = buildSyntheticRequest('POST', '/webhooks', {
      headers: { 'stripe-signature': 'whsec_123' },
    });
    expect(req.headers.get('stripe-signature')).toBe('whsec_123');
  });

  it('encodes param values in URL', () => {
    const req = buildSyntheticRequest('GET', '/search/:term', {
      params: { term: 'hello world' },
    });
    expect(new URL(req.url).pathname).toBe('/search/hello%20world');
  });

  it('omits undefined/null query params', () => {
    const req = buildSyntheticRequest('GET', '/users', {
      query: { page: 1, search: undefined, filter: null },
    });
    const url = new URL(req.url);
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.has('search')).toBe(false);
    expect(url.searchParams.has('filter')).toBe(false);
  });
});
```

### Phase 3: Response Parser

**Files:** `src/response/response-parser.ts`

- Parse JSON responses
- Handle empty responses (204, null body)
- Set `ok: true` for 2xx, `ok: false` for non-2xx
- Preserve status and headers

**Tests:**
```typescript
// src/response/__tests__/response-parser.test.ts
describe('parseTestResponse', () => {
  it('parses JSON body from 200 response', async () => {
    const response = new Response(JSON.stringify({ id: '1', name: 'John' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseTestResponse(response);
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toEqual({ id: '1', name: 'John' });
  });

  it('returns ok: true for 201', async () => {
    const response = new Response(JSON.stringify({ id: '1' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
    const result = await parseTestResponse(response);
    expect(result.ok).toBe(true);
  });

  it('returns ok: false for 400', async () => {
    const response = new Response(
      JSON.stringify({ message: 'Bad request', code: 'BAD_REQUEST' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const result = await parseTestResponse(response);
    expect(result.ok).toBe(false);
    expect(result.body).toEqual({ message: 'Bad request', code: 'BAD_REQUEST' });
  });

  it('returns ok: false for 404', async () => {
    const response = new Response(
      JSON.stringify({ message: 'Not found', code: 'NOT_FOUND' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
    const result = await parseTestResponse(response);
    expect(result.ok).toBe(false);
  });

  it('returns ok: false for 500', async () => {
    const response = new Response(
      JSON.stringify({ message: 'Internal error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
    const result = await parseTestResponse(response);
    expect(result.ok).toBe(false);
  });

  it('handles 204 No Content', async () => {
    const response = new Response(null, { status: 204 });
    const result = await parseTestResponse(response);
    expect(result.status).toBe(204);
    expect(result.ok).toBe(true);
    expect(result.body).toBeUndefined();
  });

  it('preserves response headers', async () => {
    const response = new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'abc-123',
      },
    });
    const result = await parseTestResponse(response);
    expect(result.headers.get('x-request-id')).toBe('abc-123');
  });
});
```

### Phase 4: Response Validator

**Files:** `src/response/response-validator.ts`

- Validate handler return against response schema using `safeParse`
- Throw descriptive error on validation failure
- No-op when response schema is absent
- Format error messages with method, route, and issue details

**Tests:**
```typescript
// src/response/__tests__/response-validator.test.ts
describe('validateResponse', () => {
  it('passes when handler result matches schema', () => {
    const schema = s.object({ id: s.string(), name: s.string() });
    expect(() =>
      validateResponse('GET', '/users/:id', schema, { id: '1', name: 'John' }),
    ).not.toThrow();
  });

  it('throws when handler result has unexpected keys', () => {
    const schema = s.object({ id: s.string() }).strict();
    expect(() =>
      validateResponse('GET', '/users/:id', schema, { id: '1', extra: 'oops' }),
    ).toThrow('Response validation failed for GET /users/:id');
  });

  it('throws when handler result has wrong types', () => {
    const schema = s.object({ id: s.string() });
    expect(() =>
      validateResponse('GET', '/users/:id', schema, { id: 123 }),
    ).toThrow('Response validation failed');
  });

  it('does nothing when schema is null/undefined', () => {
    expect(() =>
      validateResponse('GET', '/users', null, { anything: true }),
    ).not.toThrow();
    expect(() =>
      validateResponse('GET', '/users', undefined, { anything: true }),
    ).not.toThrow();
  });

  it('includes issue path in error message', () => {
    const schema = s.object({
      user: s.object({ id: s.string() }),
    });
    try {
      validateResponse('GET', '/profile', schema, { user: { id: 123 } });
    } catch (e: any) {
      expect(e.message).toContain('user.id');
    }
  });
});
```

### Phase 5: Mock Registry and Merge Logic

**Files:** `src/test-app/mock-registry.ts`, `src/mocks/service-mock.ts`, `src/mocks/middleware-mock.ts`

- Create empty registry
- Merge app-level and per-request registries
- Per-request service mocks deep-merge with app-level defaults
- Per-request middleware mocks replace app-level entirely
- Service mock resolution by reference
- Middleware mock resolution by reference

**Tests:**
```typescript
// src/test-app/__tests__/mock-registry.test.ts
describe('MockRegistry', () => {
  it('creates empty registry', () => {
    const registry = createMockRegistry();
    expect(registry.services.size).toBe(0);
    expect(registry.middlewares.size).toBe(0);
  });

  it('merges app-level and per-request service mocks', () => {
    const serviceRef = {};
    const appLevel = createMockRegistry();
    appLevel.services.set(serviceRef, { findById: vi.fn(), findAll: vi.fn() });

    const perRequest = createMockRegistry();
    perRequest.services.set(serviceRef, { findById: vi.fn().mockResolvedValue(null) });

    const merged = mergeMockRegistries(appLevel, perRequest);
    const mergedService = merged.services.get(serviceRef) as any;

    // Per-request findById overrides app-level
    expect(mergedService.findById).not.toBe(appLevel.services.get(serviceRef));
    // App-level findAll is preserved
    expect(mergedService.findAll).toBeDefined();
  });

  it('per-request middleware mock replaces app-level', () => {
    const middlewareRef = {};
    const appLevel = createMockRegistry();
    appLevel.middlewares.set(middlewareRef, { user: { id: '1', role: 'admin' } });

    const perRequest = createMockRegistry();
    perRequest.middlewares.set(middlewareRef, { user: { id: '2', role: 'viewer' } });

    const merged = mergeMockRegistries(appLevel, perRequest);
    expect(merged.middlewares.get(middlewareRef)).toEqual({
      user: { id: '2', role: 'viewer' },
    });
  });

  it('preserves app-level mocks when no per-request override', () => {
    const serviceA = {};
    const serviceB = {};
    const appLevel = createMockRegistry();
    appLevel.services.set(serviceA, { method: vi.fn() });

    const perRequest = createMockRegistry();
    perRequest.services.set(serviceB, { other: vi.fn() });

    const merged = mergeMockRegistries(appLevel, perRequest);
    expect(merged.services.has(serviceA)).toBe(true);
    expect(merged.services.has(serviceB)).toBe(true);
  });
});

// src/mocks/__tests__/service-mock.test.ts
describe('resolveService', () => {
  it('returns mocked instance when service is mocked', () => {
    const ref = {};
    const impl = { findById: vi.fn() };
    const mocks = new Map([[ref, impl]]);

    const result = resolveService(ref, 'test.service', mocks);
    expect(result).toEqual({ mocked: true, instance: impl });
  });

  it('returns mocked: false when service is not mocked', () => {
    const ref = {};
    const mocks = new Map();

    const result = resolveService(ref, 'test.service', mocks);
    expect(result).toEqual({ mocked: false });
  });
});

// src/mocks/__tests__/middleware-mock.test.ts
describe('resolveMiddleware', () => {
  it('bypasses mocked middleware and returns result', () => {
    const ref = {};
    const result = { user: { id: '1', role: 'admin' } };
    const mocks = new Map([[ref, result]]);

    const resolved = resolveMiddleware(ref, mocks);
    expect(resolved).toEqual({ bypassed: true, result });
  });

  it('does not bypass unmocked middleware', () => {
    const ref = {};
    const mocks = new Map();

    const resolved = resolveMiddleware(ref, mocks);
    expect(resolved).toEqual({ bypassed: false });
  });
});
```

### Phase 6: Request Builder (Thenable)

**Files:** `src/request/request-builder.ts`

- Implements `PromiseLike` interface
- `.mock()` stores per-request service override
- `.mockMiddleware()` stores per-request middleware override
- `await` triggers execution via `.then()`
- Merges app-level and per-request mocks before execution

**Tests:**
```typescript
// src/request/__tests__/request-builder.test.ts
describe('RequestBuilder', () => {
  it('is thenable — has .then() method', () => {
    const builder = new RequestBuilder(mockConfig, 'GET', '/test');
    expect(typeof builder.then).toBe('function');
  });

  it('can be awaited', async () => {
    // Requires a mock handler that returns a Response
    const config = createTestConfig({
      handler: async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const result = await new RequestBuilder(config, 'GET', '/test');
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
  });

  it('stores per-request service mock', () => {
    const serviceRef = {};
    const builder = new RequestBuilder(mockConfig, 'GET', '/test');
    const chained = builder.mock(serviceRef, { method: vi.fn() });
    // Returns self for chaining
    expect(chained).toBe(builder);
  });

  it('stores per-request middleware mock', () => {
    const middlewareRef = {};
    const builder = new RequestBuilder(mockConfig, 'GET', '/test');
    const chained = builder.mockMiddleware(middlewareRef, { user: { id: '1' } });
    expect(chained).toBe(builder);
  });

  it('per-request mock overrides app-level mock', async () => {
    const serviceRef = {};
    const appFn = vi.fn().mockResolvedValue('app-level');
    const requestFn = vi.fn().mockResolvedValue('request-level');

    const config = createTestConfig({
      mocks: { services: new Map([[serviceRef, { method: appFn }]]) },
    });

    const builder = new RequestBuilder(config, 'GET', '/test');
    builder.mock(serviceRef, { method: requestFn });

    // When executed, the request-level mock should be used
    // This test verifies merge logic is applied
  });
});
```

### Phase 7: TestAppBuilder — Builder Chain

**Files:** `src/test-app/test-app-builder.ts`

- `.env()` stores env overrides
- `.mock()` stores app-level service mock
- `.mockMiddleware()` stores app-level middleware mock
- `.register()` stores module with options
- HTTP methods (`.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.head()`) return `RequestBuilder`
- Builder is reusable — multiple requests from the same builder

**Tests:**
```typescript
// src/test-app/__tests__/test-app-builder.test.ts
describe('TestAppBuilder', () => {
  it('createTestApp returns a builder', () => {
    const builder = createTestApp();
    expect(builder).toBeDefined();
    expect(typeof builder.env).toBe('function');
    expect(typeof builder.mock).toBe('function');
    expect(typeof builder.mockMiddleware).toBe('function');
    expect(typeof builder.register).toBe('function');
  });

  it('.env() stores environment overrides', () => {
    const builder = createTestApp().env({
      DATABASE_URL: 'postgres://test/test',
      JWT_SECRET: 'test-secret',
    });
    // Builder is chainable
    expect(builder).toBeDefined();
  });

  it('.mock() stores service mock', () => {
    const serviceRef = {};
    const builder = createTestApp().mock(serviceRef, { method: vi.fn() });
    expect(builder).toBeDefined();
  });

  it('.mockMiddleware() stores middleware mock', () => {
    const middlewareRef = {};
    const builder = createTestApp().mockMiddleware(middlewareRef, {
      user: { id: '1', role: 'admin' },
    });
    expect(builder).toBeDefined();
  });

  it('.register() stores module', () => {
    const module = {};
    const builder = createTestApp().register(module, { option: true });
    expect(builder).toBeDefined();
  });

  it('supports full builder chain', () => {
    const serviceRef = {};
    const middlewareRef = {};
    const module = {};

    const builder = createTestApp()
      .env({ KEY: 'value' })
      .mock(serviceRef, {})
      .mockMiddleware(middlewareRef, {})
      .register(module, {});

    expect(builder).toBeDefined();
  });

  it('.get() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.get('/test');
    expect(typeof request.then).toBe('function');
  });

  it('.post() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.post('/test', { body: { name: 'Jane' } });
    expect(typeof request.then).toBe('function');
  });

  it('.put() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.put('/test/:id', { params: { id: '1' }, body: {} });
    expect(typeof request.then).toBe('function');
  });

  it('.patch() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.patch('/test/:id', { params: { id: '1' }, body: {} });
    expect(typeof request.then).toBe('function');
  });

  it('.delete() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.delete('/test/:id', { params: { id: '1' } });
    expect(typeof request.then).toBe('function');
  });

  it('.head() returns a RequestBuilder', () => {
    const builder = createTestApp();
    const request = builder.head('/test');
    expect(typeof request.then).toBe('function');
  });
});
```

### Phase 8: TestServiceBuilder — Unit Testing Services

**Files:** `src/test-service/test-service-builder.ts`

- `createTestService(serviceDef)` returns a builder
- `.mock()` stores dependency mocks
- `.options()` stores module options
- `.env()` stores env overrides
- Build resolves inject, constructs deps, calls `methods(deps, state)`
- Throws if a dependency is not mocked

**Tests:**
```typescript
// src/test-service/__tests__/test-service-builder.test.ts
describe('TestServiceBuilder', () => {
  it('creates service with mocked dependencies', () => {
    const dbService = {
      inject: {},
      methods: (deps: any) => ({
        query: vi.fn(),
      }),
    };

    const userService = {
      inject: { db: dbService },
      methods: (deps: any) => ({
        findById: async (id: string) => deps.db.query(id),
      }),
    };

    const mockDb = { query: vi.fn().mockResolvedValue({ id: '1', name: 'John' }) };

    const service = createTestService(userService)
      .mock(dbService, mockDb);

    // Service should be buildable and have the expected methods
    // (Implementation details of how the service is exposed TBD)
  });

  it('throws when a dependency is not mocked', () => {
    const dbService = {
      inject: {},
      methods: () => ({ query: vi.fn() }),
    };

    const userService = {
      inject: { db: dbService },
      methods: (deps: any) => ({
        findById: async (id: string) => deps.db.query(id),
      }),
    };

    expect(() => {
      createTestService(userService);
      // Attempt to build without mocking dbService
    }).toThrow(/not mocked/);
  });

  it('passes module options to service deps', () => {
    const service = {
      inject: {},
      methods: (deps: any) => ({
        getMax: () => deps.options.maxRetries,
      }),
    };

    const built = createTestService(service)
      .options({ maxRetries: 3 });

    // built.getMax() should return 3
  });

  it('passes env to service deps', () => {
    const service = {
      inject: {},
      methods: (deps: any) => ({
        getSecret: () => deps.env.JWT_SECRET,
      }),
    };

    const built = createTestService(service)
      .env({ JWT_SECRET: 'test-secret' });

    // built.getSecret() should return 'test-secret'
  });
});
```

### Phase 9: Test App Runner — Full Pipeline Integration

**Files:** `src/test-app/test-app-runner.ts`

This phase wires everything together. The runner uses core's internal API to build the handler pipeline with mock injection. This is the most complex phase and depends on core exposing the necessary internal hooks.

- Boot executor with service mock injection
- Middleware runner with mock awareness
- Response validation after handler execution
- Env bypass (direct values, no file loading)
- Full request lifecycle: route match → validation → middleware → handler → response

**Tests:**
```typescript
// src/test-app/__tests__/test-app-runner.test.ts
describe('TestAppRunner', () => {
  // These tests require minimal core service/module/router definitions
  // to verify the full pipeline works end-to-end.

  it('executes a GET request through the pipeline', async () => {
    // Setup: create a minimal module with a GET route
    // Mock the service, register the module, send a GET request
    // Assert: correct status, body, headers
  });

  it('executes a POST request with body', async () => {
    // Setup: create a module with a POST route that reads body
    // Assert: handler receives parsed body
  });

  it('mocked service is used instead of real service', async () => {
    // Setup: mock dbService with vi.fn()
    // Assert: real onInit is NOT called, mock is injected
  });

  it('mocked middleware is bypassed', async () => {
    // Setup: mock authMiddleware with { user: { id: '1', role: 'admin' } }
    // Assert: middleware handler is NOT called, mock result is in state
  });

  it('non-mocked middleware runs normally', async () => {
    // Setup: register a middleware without mocking it
    // Assert: middleware handler IS called
  });

  it('per-request mock overrides app-level mock', async () => {
    // Setup: app-level mock for authMiddleware with admin
    // Per-request override with viewer role
    // Assert: handler receives viewer role
  });

  it('validates response against schema', async () => {
    // Setup: handler returns data not matching response schema
    // Assert: response validation error
  });

  it('schema validation rejects invalid body', async () => {
    // Setup: POST with body that doesn't match body schema
    // Assert: 422 validation error
  });

  it('schema validation rejects invalid params', async () => {
    // Setup: GET with params that don't match params schema
    // Assert: 422 validation error
  });

  it('schema validation rejects invalid query', async () => {
    // Setup: GET with query that doesn't match query schema
    // Assert: 422 validation error
  });

  it('handles VertzException correctly', async () => {
    // Setup: handler throws NotFoundException
    // Assert: 404 status, error body with message and code
  });

  it('handles unexpected errors as 500', async () => {
    // Setup: handler throws a generic Error
    // Assert: 500 status
  });

  it('returns 404 for unregistered routes', async () => {
    // Assert: GET /nonexistent → 404
  });

  it('env values are available in handler context', async () => {
    // Setup: .env({ JWT_SECRET: 'test' })
    // Assert: handler can access env.JWT_SECRET
  });
});
```

### Phase 10: Test Env

**Files:** `src/env/test-env.ts`

- Create test env from direct values
- No .env file loading
- No schema validation (test author controls values)
- Plain object (no freeze, no proxy)

**Tests:**
```typescript
// src/env/__tests__/test-env.test.ts
describe('createTestEnv', () => {
  it('returns an object with provided values', () => {
    const env = createTestEnv({
      DATABASE_URL: 'postgres://test/test',
      JWT_SECRET: 'test-secret',
    });
    expect(env.DATABASE_URL).toBe('postgres://test/test');
    expect(env.JWT_SECRET).toBe('test-secret');
  });

  it('returns a new object (not the same reference)', () => {
    const input = { KEY: 'value' };
    const env = createTestEnv(input);
    expect(env).not.toBe(input);
    expect(env).toEqual(input);
  });

  it('handles empty values', () => {
    const env = createTestEnv({});
    expect(env).toEqual({});
  });
});
```

### Phase 11: Vertz Namespace Re-export

**Files:** `src/vertz-testing.ts`, `src/index.ts`

- Re-export `vertz` from `@vertz/core` with `testing` namespace attached
- `vertz.testing.createApp` points to `createTestApp`
- `vertz.testing.createService` points to `createTestService`
- All core `vertz` methods remain accessible
- Re-export core types for convenience

**Tests:**
```typescript
// src/__tests__/index.test.ts
describe('@vertz/testing public API', () => {
  it('exports vertz with testing namespace', () => {
    expect(vertz.testing).toBeDefined();
    expect(typeof vertz.testing.createApp).toBe('function');
    expect(typeof vertz.testing.createService).toBe('function');
  });

  it('preserves core vertz methods', () => {
    // All core methods should be accessible
    expect(typeof vertz.env).toBe('function');
    expect(typeof vertz.middleware).toBe('function');
    expect(typeof vertz.moduleDef).toBe('function');
    expect(typeof vertz.module).toBe('function');
    expect(typeof vertz.app).toBe('function');
  });

  it('vertz.testing.createApp returns a TestAppBuilder', () => {
    const app = vertz.testing.createApp();
    expect(typeof app.env).toBe('function');
    expect(typeof app.mock).toBe('function');
    expect(typeof app.mockMiddleware).toBe('function');
    expect(typeof app.register).toBe('function');
    expect(typeof app.get).toBe('function');
    expect(typeof app.post).toBe('function');
  });
});
```

### Phase 12: End-to-End Integration Tests

**Files:** `src/__tests__/integration/`

Full integration tests that mirror the examples from the testing design document. These tests verify the complete workflow from builder → request → response.

**Tests:**
```typescript
// src/__tests__/integration/integration.test.ts
// These tests require actual @vertz/core module/service/router definitions.
// They verify the testing package works end-to-end with core.

describe('Integration: User routes', () => {
  // Mirror the full example from vertz-testing-design.md
  // This validates the entire testing workflow works as designed.

  const mockDb = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  };

  // const app = vertz.testing
  //   .createApp()
  //   .env({ DATABASE_URL: '...', JWT_SECRET: '...' })
  //   .mock(dbService, mockDb)
  //   .mockMiddleware(authMiddleware, { user: { id: 'default', role: 'admin' } })
  //   .register(coreModule)
  //   .register(userModule, { requireEmailVerification: false });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns user by id', async () => {
    // mockDb.user.findUnique.mockResolvedValueOnce({ ... });
    // const res = await app.get('/users/:id', { params: { id: '123' } });
    // expect(res.status).toBe(200);
    // expect(res.ok).toBe(true);
    // expect(res.body).toEqual({ ... });
  });

  it('POST creates a user', async () => {
    // const res = await app.post('/users', { body: { name: 'Jane', ... } });
    // expect(res.status).toBe(201);
  });

  it('per-request middleware override works', async () => {
    // const res = await app
    //   .get('/users/:id', { params: { id: '123' } })
    //   .mockMiddleware(authMiddleware, { user: { id: 'viewer', role: 'viewer' } });
    // expect(res.status).toBe(403);
  });
});
```

---

## Verification

1. **Zero external deps**: Only `@vertz/core` and `@vertz/schema` in dependencies (workspace)
2. **ESM only**: `"type": "module"`, all ESM imports
3. **Tests pass**: `vitest run` exits cleanly
4. **Types pass**: `tsc --noEmit` with `isolatedDeclarations: true`
5. **Builder pattern**: `createTestApp()` returns chainable builder, HTTP methods return thenable `RequestBuilder`
6. **Thenable execution**: `await app.get('/route')` triggers execution — no `.send()` method
7. **Mock scoping**: App-level mocks apply to all requests, per-request overrides take precedence
8. **Service mock by reference**: `.mock(serviceRef, impl)` uses reference identity, not string names
9. **Middleware bypass**: Mocked middlewares are fully bypassed, non-mocked run normally
10. **Response validation**: Always on in test mode, catches handler/schema mismatches
11. **Typed responses**: `res.ok` narrows `res.body` to success or error type
12. **Test env**: Direct values, no .env file loading, no schema validation
13. **Service unit testing**: `createTestService(def)` with `.mock()`, `.options()`, `.env()`
14. **Namespace re-export**: `vertz` from `@vertz/testing` includes all core methods + `testing`
15. **Build output**: bunup produces clean ESM with `.d.ts`
16. **No vitest wrapper**: `vi.fn()` is `vi.fn()` — no `vertz.fn()` abstraction

---

## Open Items

- [ ] **Core internal API surface** — `@vertz/core` needs to expose internal hooks for the testing package (boot executor with mock injection, middleware runner with mock awareness, handler builder in test mode). The exact API shape depends on the core implementation.
- [ ] **Async `onInit` in `createTestService`** — Services with async `onInit` need special handling. Options: (a) make the builder async (await before accessing methods), (b) require sync `onInit` in tests, (c) lazy build on first method access.
- [ ] **Deep merge edge cases** — The deep merge for per-request service mocks needs careful handling of arrays, `null`, `undefined`, and prototype chain. May need to use a more robust merge strategy.
- [ ] **Route type extraction** — Typed route strings require the compiler to generate route type information. The testing package needs to consume these generated types. The exact mechanism depends on the compiler output format.
- [ ] **Response body type for routes with no response schema** — Routes that don't return a value (e.g., `POST /users/:id/activate`) need a `void` or `undefined` body type in `TestResponse`.
- [ ] **Test app reuse vs rebuild** — Should the test app rebuild the handler on every request (to pick up per-request mocks) or cache and patch? Caching is faster but complicates per-request mock isolation.
- [ ] **Error response shape standardization** — The `ErrorResponse.body` shape (`{ message, code, details }`) must match the core exception `toJSON()` output exactly. Verify alignment.
- [ ] **HEAD response handling** — HEAD requests return headers but no body. The response parser needs to handle this correctly (body should be `undefined` or empty).
