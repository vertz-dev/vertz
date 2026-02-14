# @vertz/core

> Type-safe, dependency-injection-first web framework for Node.js and Bun

The core framework package for building modular web applications with built-in routing, middleware, dependency injection, and schema validation. Designed for developer experience with end-to-end type safety.

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5.0+

## Installation

```bash
# npm
npm install @vertz/core

# bun
bun add @vertz/core
```

## Quick Start

Create a simple API server in under 5 minutes:

```typescript
import { createApp, createModuleDef, createModule } from '@vertz/core';

// 1. Define a module
const moduleDef = createModuleDef({ name: 'users' });

// 2. Create a router with routes
const router = moduleDef.router({ prefix: '/users' });

router.get('/', {
  handler: () => ({ users: [] }),
});

router.get('/:id', {
  handler: (ctx) => ({ id: ctx.params.id }),
});

// 3. Create the module
const usersModule = createModule(moduleDef, {
  services: [],
  routers: [router],
  exports: [],
});

// 4. Create and start the app
const app = createApp({})
  .register(usersModule);

await app.listen(3000);
// Server running on http://localhost:3000
```

Test it:

```bash
curl http://localhost:3000/users
# {"users":[]}

curl http://localhost:3000/users/42
# {"id":"42"}
```

## Core Concepts

### Modules

Modules are the building blocks of a vertz application. Each module encapsulates related functionality (routes, services, business logic) and can be registered with the app.

```typescript
import { createModuleDef, createModule } from '@vertz/core';

const moduleDef = createModuleDef({ name: 'products' });

// Define services, routers, and exports...
const productsModule = createModule(moduleDef, {
  services: [/* service definitions */],
  routers: [/* router definitions */],
  exports: [/* exported services for other modules */],
});
```

### Services (Dependency Injection)

Services encapsulate business logic and can be injected into route handlers or other services.

```typescript
const moduleDef = createModuleDef({ name: 'users' });

// Define a service
const userService = moduleDef.service({
  methods: () => ({
    findById: (id: string) => ({ id, name: 'Jane Doe' }),
    create: (name: string) => ({ id: '123', name }),
  }),
});

// Inject service into router
const router = moduleDef.router({
  prefix: '/users',
  inject: { userService }, // ✅ Type-safe injection
});

router.get('/:id', {
  handler: (ctx) => {
    // ctx.userService is fully typed!
    return ctx.userService.findById(ctx.params.id);
  },
});

const usersModule = createModule(moduleDef, {
  services: [userService],
  routers: [router],
  exports: [userService], // Export for other modules
});
```

### Routing

Routers define HTTP endpoints with full type safety for params, query, headers, and body.

```typescript
const router = moduleDef.router({ prefix: '/api' });

// GET /api/items
router.get('/items', {
  handler: () => ({ items: [] }),
});

// GET /api/items/:id
router.get('/items/:id', {
  handler: (ctx) => {
    const { id } = ctx.params; // Type-safe params
    return { id, name: 'Item' };
  },
});

// POST /api/items
router.post('/items', {
  handler: (ctx) => {
    const data = ctx.body; // Parsed request body
    return { created: true, data };
  },
});

// All HTTP methods supported
router.put('/items/:id', { handler: (ctx) => ({ updated: true }) });
router.patch('/items/:id', { handler: (ctx) => ({ patched: true }) });
router.delete('/items/:id', { handler: (ctx) => ({ deleted: true }) });
```

### Schema Validation

Use [@vertz/schema](../schema) for request/response validation:

```typescript
import { s } from '@vertz/schema';

const createUserSchema = s.object({
  name: s.string().min(1),
  email: s.string().email(),
  age: s.number().int().min(18),
});

router.post('/users', {
  body: createUserSchema,
  handler: (ctx) => {
    // ctx.body is fully typed as { name: string; email: string; age: number }
    const user = ctx.body;
    return { created: true, user };
  },
});
```

If the request body doesn't match the schema, a `ValidationException` is thrown automatically.

**Note:** `@vertz/schema` is a separate package. Install it with `npm install @vertz/schema`.

### Middleware

Middleware can inject values into the request context, perform authentication, logging, etc.

```typescript
import { createMiddleware, createApp } from '@vertz/core';

// Define middleware that provides user info
const authMiddleware = createMiddleware({
  name: 'auth',
  handler: (ctx) => {
    // Validate auth token, fetch user, etc.
    return { user: { id: '1', role: 'admin' } };
  },
});

// Apply middleware globally
const app = createApp({})
  .middlewares([authMiddleware])
  .register(usersModule);

// Now all routes have access to ctx.user
router.get('/profile', {
  handler: (ctx) => {
    return { profile: ctx.user }; // Type-safe!
  },
});
```

### Exception Handling

Built-in HTTP exceptions with proper status codes:

```typescript
import {
  NotFoundException,
  UnauthorizedException,
  ValidationException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@vertz/core';

router.get('/users/:id', {
  handler: (ctx) => {
    const user = findUser(ctx.params.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  },
});
```

All exceptions are automatically converted to proper JSON responses:

```json
{
  "error": "NotFoundException",
  "message": "User not found",
  "statusCode": 404
}
```

## API Reference

### `createApp(config)`

Creates a new application builder.

**Parameters:**
- `config: AppConfig` — App configuration
  - `basePath?: string` — Base path prefix for all routes (e.g., `/api`)
  - `cors?: CorsConfig` — CORS configuration
    - `origins?: boolean | string[]` — Allow all origins (`true`) or specific origins
    - `methods?: string[]` — Allowed HTTP methods
    - `headers?: string[]` — Allowed headers
    - `credentials?: boolean` — Allow credentials

**Returns:** `AppBuilder<TMiddlewareCtx>`

**Example:**

```typescript
const app = createApp({
  basePath: '/api',
  cors: {
    origins: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});
```

### `AppBuilder` Methods

#### `.register(module, options?)`

Registers a module with the app.

**Parameters:**
- `module: NamedModule` — The module to register
- `options?: Record<string, unknown>` — Module-specific options (available via `ctx.options`)

**Returns:** `AppBuilder` (chainable)

**Example:**

```typescript
app.register(usersModule, { maxRetries: 3 });
```

#### `.middlewares(list)`

Registers global middleware that runs before all route handlers.

**Parameters:**
- `list: NamedMiddlewareDef[]` — Array of middleware definitions

**Returns:** `AppBuilder` (chainable)

**Example:**

```typescript
app.middlewares([authMiddleware, loggingMiddleware]);
```

#### `.handler`

The request handler function. Use this with custom server adapters or testing.

**Type:** `(request: Request) => Promise<Response>`

**Example:**

```typescript
const response = await app.handler(new Request('http://localhost/users'));
```

#### `.listen(port?, options?)`

Starts the HTTP server.

**Parameters:**
- `port?: number` — Port to listen on (default: 3000)
- `options?: ListenOptions`
  - `logRoutes?: boolean` — Log registered routes on startup (default: `true`)

**Returns:** `Promise<ServerHandle>`

**Example:**

```typescript
const server = await app.listen(3000, { logRoutes: true });
console.log(`Server running on http://${server.hostname}:${server.port}`);
```

### `createModuleDef(config)`

Creates a module definition — the factory for services and routers.

**Parameters:**
- `config: { name: string }` — Module name (must be unique)

**Returns:** Module definition builder

**Example:**

```typescript
const moduleDef = createModuleDef({ name: 'products' });
```

### Module Definition Methods

#### `.service(config)`

Defines a service with optional dependencies, state, and methods.

**Parameters:**
- `config: ServiceConfig`
  - `methods: (deps, state) => TMethods` — Factory function that returns service methods

**Returns:** `NamedServiceDef`

**Example:**

```typescript
const productService = moduleDef.service({
  methods: () => ({
    findAll: () => [{ id: '1', name: 'Product 1' }],
    findById: (id: string) => ({ id, name: 'Product' }),
  }),
});
```

#### `.router(config)`

Defines a router with routes.

**Parameters:**
- `config: RouterConfig`
  - `prefix: string` — URL prefix for all routes in this router (e.g., `/users`)
  - `inject?: Record<string, NamedServiceDef>` — Services to inject into route handlers

**Returns:** Router builder with HTTP method functions

**Example:**

```typescript
const router = moduleDef.router({
  prefix: '/products',
  inject: { productService },
});

router.get('/', { handler: (ctx) => ctx.productService.findAll() });
router.get('/:id', { handler: (ctx) => ctx.productService.findById(ctx.params.id) });
```

### Router Methods

All routers expose these HTTP method functions:

- `get(path, config)`
- `post(path, config)`
- `put(path, config)`
- `patch(path, config)`
- `delete(path, config)`
- `head(path, config)`

**Route Config:**

```typescript
interface RouteConfig {
  params?: SchemaType;     // Schema for URL params
  query?: SchemaType;      // Schema for query string
  headers?: SchemaType;    // Schema for headers
  body?: SchemaType;       // Schema for request body
  response?: SchemaType;   // Schema for response (documentation)
  handler: (ctx) => unknown; // Route handler
}
```

### `createModule(moduleDef, config)`

Creates a concrete module instance from a module definition.

**Parameters:**
- `moduleDef: NamedModuleDef` — Module definition
- `config: ModuleConfig`
  - `services: NamedServiceDef[]` — List of services in this module
  - `routers: NamedRouterDef[]` — List of routers in this module
  - `exports: NamedServiceDef[]` — Services to export for other modules (subset of `services`)

**Returns:** `NamedModule`

**Example:**

```typescript
const usersModule = createModule(moduleDef, {
  services: [userService, authService],
  routers: [userRouter, authRouter],
  exports: [userService], // Only userService is accessible to other modules
});
```

### `createMiddleware(config)`

Creates reusable middleware.

**Parameters:**
- `config: MiddlewareConfig`
  - `name: string` — Middleware name
  - `handler: (ctx) => TProvides` — Middleware handler that returns context contributions

**Returns:** `NamedMiddlewareDef<TRequires, TProvides>`

**Example:**

```typescript
const loggingMiddleware = createMiddleware({
  name: 'logging',
  handler: (ctx) => {
    console.log(`${ctx.method} ${ctx.path}`);
    return {}; // No context contributions
  },
});

const authMiddleware = createMiddleware({
  name: 'auth',
  handler: (ctx) => {
    const token = ctx.headers.get('authorization');
    const user = validateToken(token);
    if (!user) throw new UnauthorizedException('Invalid token');
    return { user }; // Adds `user` to context
  },
});
```

### Handler Context (`ctx`)

Every route handler receives a context object with:

```typescript
interface HandlerCtx {
  // Request properties
  method: string;           // HTTP method (GET, POST, etc.)
  path: string;            // Request path
  params: Record<string, string>; // URL params
  query: Record<string, unknown>; // Query string (parsed)
  headers: Headers;        // Request headers
  body: unknown;           // Parsed request body (JSON)
  request: Request;        // Raw Request object

  // Module context
  options: Record<string, unknown>; // Module registration options

  // Injected services (from router inject)
  // ... (typed based on inject config)

  // Middleware contributions (from global/route middlewares)
  // ... (typed based on middleware chain)
}
```

## Configuration

### App Configuration

```typescript
interface AppConfig {
  basePath?: string;     // Global path prefix (e.g., "/api")
  cors?: CorsConfig;     // CORS settings
}
```

### CORS Configuration

```typescript
interface CorsConfig {
  origins?: boolean | string[];  // true = allow all, or array of allowed origins
  methods?: string[];           // Allowed HTTP methods
  headers?: string[];           // Allowed headers
  credentials?: boolean;        // Allow credentials
  maxAge?: number;             // Preflight cache duration (seconds)
}
```

## Related Packages

- **[@vertz/schema](../schema)** — Type-safe schema definition and validation (`s.string()`, `s.object()`, etc.)
- **[@vertz/testing](../testing)** — Testing utilities for vertz apps (`createTestApp`, `createTestService`)
- **[@vertz/cli](../cli)** — CLI framework for building command-line tools
- **[@vertz/compiler](../compiler)** — Static analysis and code generation
- **@vertz/db** — Type-safe database ORM with migrations _(Coming soon)_
- **@vertz/fetch** — Type-safe HTTP client with retry and streaming support _(Coming soon)_
- **@vertz/ui** — Reactive UI framework for vertz apps _(Coming soon)_

## Examples

See the [examples/](./examples) directory for complete working examples:

- **[basic-api](./examples/basic-api)** — Simple REST API with CRUD operations
- (More examples coming soon)

## Advanced Topics

### Multiple Modules

```typescript
const usersModule = createModule(/* ... */);
const productsModule = createModule(/* ... */);
const ordersModule = createModule(/* ... */);

const app = createApp({})
  .register(usersModule)
  .register(productsModule)
  .register(ordersModule);
```

### Module Options

Pass configuration to modules at registration time:

```typescript
const emailModule = createModule(/* ... */);

app.register(emailModule, {
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
});

// Access in route handlers:
router.post('/send', {
  handler: (ctx) => {
    const { smtpHost, smtpPort } = ctx.options;
    // Use config...
  },
});
```

### Custom Server Adapters

Use the `.handler` property to integrate with custom servers:

```typescript
import { serve } from 'bun';

const app = createApp({}).register(usersModule);

serve({
  port: 3000,
  fetch: app.handler,
});
```

### Development vs Production

The framework automatically provides immutable context objects in development mode to catch mutation bugs early.

```typescript
// In development (NODE_ENV=development):
router.get('/users', {
  handler: (ctx) => {
    ctx.params = {}; // ❌ Throws error — cannot mutate frozen object
  },
});

// In production: no immutability checks for performance
```

## TypeScript Support

All APIs are fully typed with generics for end-to-end type safety:

```typescript
import { s } from '@vertz/schema';

const userSchema = s.object({
  name: s.string(),
  email: s.string().email(),
});

router.post('/users', {
  body: userSchema,
  handler: (ctx) => {
    // ctx.body is typed as { name: string; email: string }
    const { name, email } = ctx.body; // ✅ Autocomplete works!
    return { created: true };
  },
});
```

Service injection is also fully typed:

```typescript
const router = moduleDef.router({
  prefix: '/users',
  inject: { userService, authService },
});

router.get('/', {
  handler: (ctx) => {
    // ctx.userService and ctx.authService are fully typed
    ctx.userService.findAll(); // ✅ Autocomplete shows all methods
  },
});
```

## License

MIT
