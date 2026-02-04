# Vertz Features

Everything the framework, compiler, and tooling will ship with.

---

## Core Framework

### Type-Safe Dependency Injection

Functional DI with typed references — no decorators, no runtime resolution. Module definitions declare imports as typed references. Services declare their injections. If your code builds, your dependencies resolve.

### Module System

Four-layer architecture: `moduleDef` (contract) → `service`/`router` (implementation) → `module` (assembly) → `app` (composition). Each layer has a single responsibility and clear type boundaries.

### Middleware with Typed State Composition

Middlewares declare `Requires` and `Provides` generics. They return their contribution — no `next()`, no mutation. State composes through levels: Global → Router → Route. Wrong ordering is a type error.

### Environment Validation

`vertz.env()` validates environment variables at startup with schema. Fails fast with clear error messages. Both standalone import and injectable into modules.

### Immutability

Both `deps` and `ctx` are frozen. `DeepReadonly<T>` at compile time, `Object.freeze()` in production, Proxy with helpful error messages in development.

### Schema Validation

Request params, body, query, and headers validated against schemas. Response validated in test mode. One schema library (`@vertz/schema`) used throughout.

### Request Headers Validation

Routes can define a `headers` schema for endpoint-specific headers (webhook signatures, API keys, etc.). Only validates the defined headers — never strips or rejects extras. Common headers (auth, request ID) belong in middlewares.

### Native OpenAPI

Not a plugin — built in. Every route with a return value must define a response schema (compiler-enforced). API documentation is always in sync with implementation because they're the same declaration.

### Error Handling

Standard error response shape across the framework. `res.ok` narrows response body to success or error type in tests. Typed exceptions with error codes.

---

## Route Splitting

The developer writes one app. The compiler knows the full static dependency tree — every route, which router owns it, which services that router injects, which modules those services belong to, and what those modules import. This graph enables splitting at multiple levels without the developer changing application code.

### Compile-time splitting

The compiler can generate separate bundles per module or per route group, each containing only the code and dependencies needed. The developer configures a split strategy; the compiler produces the output. One codebase, multiple deployments.

### Runtime splitting

On edge runtimes and workers, a request comes in, we match the route, look up which modules are needed from the static dependency tree, and instantiate only those. Lazy, on-demand, per-request — no booting the full app for a single endpoint.

### What this requires from the architecture

The splitting API is not designed yet. What matters now is that the framework and compiler are built so the dependency tree is **fully static and traversable** at compile time. No dynamic imports that hide dependencies. No runtime-only wiring that the compiler can't see. If the tree is complete, splitting is a compiler feature — not an application concern.

---

## Multi-Runtime Support

Vertz runs everywhere. The framework abstracts the runtime layer so the same application code deploys to:

- **Node.js** — standard server deployment
- **Bun** — fast alternative runtime
- **Deno** — secure runtime with built-in tooling
- **Edge runtimes** — Cloudflare Workers, Vercel Edge, etc.

The `ctx.raw` provides access to the underlying runtime's request object when needed, but application code (handlers, services, middlewares) is runtime-agnostic.

---

## Compiler

### Response Schema Enforcement

If a route handler returns a value, the compiler requires a response schema. No schema, no build. This is what keeps OpenAPI docs in sync with implementation.

### Route Analysis

Static analysis of route definitions — extracts params, body, query, headers, response types, middleware chains, and service dependencies.

### Schema Analysis

Validates schema naming conventions (`{operation}{Entity}{Part}`), file placement (one per endpoint in `schemas/`), and cross-references between route definitions and schema exports.

### OpenAPI Generation

Generates OpenAPI spec from route definitions and schemas. Native — not a plugin. The spec is always accurate because it's derived from the same source as the runtime validation.

### Static Dependency Tree

The compiler builds a complete dependency graph — routes → routers → services → modules → imports. Fully resolved at compile time. This graph is the foundation for route splitting, tree-shaking, and bundle optimization. No dynamic imports that hide dependencies, no runtime-only wiring the compiler can't see.

### Circular Dependency Detection

Detects circular module imports at compile time. No runtime surprises.

### Module Validation

Verifies that services are registered in the correct module, exports are a subset of services, and injected services are declared in module imports.

---

## Testing

### Vitest

Vitest is the test runner. Not configurable — one way to do things. ESM-native, TypeScript-first, `vi.fn()` built-in.

### Builder Pattern Test App

Test app mirrors production app composition. Same `.register()`, `.mock()`, `.mockMiddleware()` calls. No separate testing mental model.

### Typed Route Strings

Autocomplete suggests only registered routes. Params, body, query, headers, and response are typed per route based on their schemas.

### Mock by Reference

`.mock(dbService, ...)` not `.mock('dbService', ...)`. Refactor-safe, typed to match the service's public API.

### Middleware Mocking

`.mockMiddleware(authMiddleware, { user: ... })` — typed to the middleware's `Provides` generic. Mocked middlewares are bypassed entirely; non-mocked ones run normally.

### Per-Request Overrides

Chain `.mock()` and `.mockMiddleware()` on the request builder for single-request overrides. App-level defaults apply to all requests.

### Union Response Body

`res.ok` narrows `res.body` to the success schema type or a standard error type. No manual casting.

### Response Validation

In test mode, the framework validates handler return values against the response schema. Catches mismatches that would produce incorrect OpenAPI docs.

### Unit Testing Services

Opt-in. `vertz.testing.createService(authService)` with the same builder pattern — `.mock()`, `.options()`, `.env()`. For complex business logic that benefits from isolated testing.

---

## CLI

### `vertz dev`

Development server with file watching, auto-reload, and compiler integration. Validates environment, compiles routes, and serves OpenAPI docs.

### `vertz build`

Production build. Runs the compiler, generates OpenAPI spec, validates all schemas and module wiring.

### `vertz generate`

Code generation for modules, services, routers, and schemas. Follows conventions automatically — file naming, folder structure, schema patterns.

---

## Packages

| Package | Purpose |
|---|---|
| `@vertz/core` | Framework core — app, modules, services, routers, middlewares, DI |
| `@vertz/schema` | Schema definition and validation |
| `@vertz/compiler` | Static analysis, route analysis, schema analysis, OpenAPI generation |
| `@vertz/cli` | CLI tooling — dev, build, generate |
| `@vertz/testing` | Testing utilities — test app, mocking, assertions |
| `@vertz/database` | Database integration and repository patterns |
| `@vertz/cache` | Caching module |
| `@vertz/pubsub` | Pub/sub messaging module |

---

## Future

Features planned but not yet designed:

- [ ] Guards (authentication/authorization patterns)
- [ ] WebSocket support
- [ ] Background jobs / queues
- [ ] UI framework (signals-based, deep Vertz integration)
- [ ] MCP (Model Context Protocol) integration
- [ ] SSR / fullstack deployment
- [ ] Client SDK generation from OpenAPI
