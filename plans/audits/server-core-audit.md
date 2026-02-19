# @vertz/server & @vertz/core Audit

**Audit Date:** 2026-02-18
**Packages Audited:**
- `@vertz/core` (v0.2.0) - Core framework primitives
- `@vertz/server` (v0.2.0) - Server runtime, routing, and auth

---

## Routing

| Feature | Status | Notes |
|---------|--------|-------|
| Route definition API | ✅ | Via `createRouterDef` with HTTP method functions (`get`, `post`, `put`, `patch`, `delete`, `head`) |
| HTTP methods (GET, POST, PUT, DELETE, PATCH) | ✅ | All supported in router-def.ts |
| Path parameters (`/users/:id`) | ✅ | Implemented in trie.ts router with `:` prefix |
| Query parameters | ✅ | Parsed in `parseRequest()` and available in ctx.query |
| Route grouping / prefixes | ✅ | Via `router({ prefix: '/path' })` option |
| Wildcard routes | ✅ | Supported with `*` in trie.ts |

---

## Middleware

| Feature | Status | Notes |
|---------|--------|-------|
| Middleware pipeline | ✅ | `runMiddlewareChain()` in middleware-runner.ts |
| Before/after hooks | ✅ | Via middleware chain execution |
| Error handling middleware | ✅ | Try/catch in app-runner.ts buildHandler |
| CORS middleware | ✅ | Full CORS support in cors.ts (origins, methods, headers, credentials, maxAge) |
| Body parsing | ✅ | JSON, text, and form-urlencoded in request-utils.ts |

---

## Request/Response

| Feature | Status | Notes |
|---------|--------|-------|
| Request object (headers, body, params, query) | ✅ | `HandlerCtx` in context.ts with all request data |
| Response helpers (json, redirect, status) | ✅ | `createJsonResponse()` in response-utils.ts; redirect/status via Response |
| Cookie handling | 🟡 | Handled indirectly via auth module (set-cookie header) |
| File upload handling | ❌ | Not implemented |
| Streaming responses | ❌ | Not implemented (but can return raw Response) |

---

## Context

| Feature | Status | Notes |
|---------|--------|-------|
| ctx object with request data | ✅ | `HandlerCtx` includes params, body, query, headers, raw |
| ctx.user (from auth middleware) | ✅ | Auth middleware sets `ctx.user` from JWT session |
| ctx.can() (from access middleware) | ✅ | `createAccess()` provides RBAC with ctx.can() and ctx.authorize() |
| Service injection via ctx | ✅ | Services resolved and merged into ctx in app-runner.ts |
| Immutable context | ✅ | `makeImmutable()` wraps ctx in ctx-builder.ts |

---

## Server

| Feature | Status | Notes |
|---------|--------|-------|
| createServer() API | ✅ | `createApp()` in app-builder.ts (aliased as createServer) |
| Dev server with HMR | ❌ | Not implemented |
| Production server | ✅ | Bun adapter in bun-adapter.ts |
| Graceful shutdown | ❌ | Only basic `server.stop()` - no graceful shutdown |
| Health check endpoint | ❌ | Not implemented |

---

## Domain / CRUD

| Feature | Status | Notes |
|---------|--------|-------|
| domain() API for auto-generated routes | ✅ | Routes registered in app-builder.ts from config.domains |
| List endpoint with pagination | 🟡 | Route registered, but handler is STUB (see domain.ts) |
| Get by ID | 🟡 | Route registered (`GET /api/:domain/:id`), handler is STUB |
| Create | 🟡 | Route registered (`POST /api/:domain`), handler is STUB |
| Update (full + partial) | 🟡 | Route registered (`PUT /api/:domain/:id`), handler is STUB |
| Delete | 🟡 | Route registered (`DELETE /api/:domain/:id`), handler is STUB |
| Custom actions | ✅ | Routes registered for actions in app-builder.ts |
| Access rules per operation | ✅ | `access` config in domain definition with read/create/update/delete rules |

---

## Integration

| Feature | Status | Notes |
|---------|--------|-------|
| SSR page serving | ❌ | Not implemented |
| Static file serving | ❌ | Not implemented |
| API prefix configuration | ✅ | `apiPrefix` option in AppConfig (default: '/api/') |
| Cloudflare Workers adapter | ❌ | Not implemented |
| Node.js adapter | ❌ | Only Bun adapter exists |

---

## Summary

### Implemented ✅
- Full routing system with path parameters, wildcards, and route prefixes
- Middleware pipeline with CORS and body parsing
- Request/Response handling (JSON responses, basic cookies via auth)
- Context system with immutability and service injection
- Auth module with JWT sessions, email/password, rate limiting
- Access control (RBAC) with ctx.can() and ctx.authorize()
- Domain API for CRUD route registration (routes generated, handlers pending)

### Partial 🟡
- Cookie handling (via auth module only)
- File upload / streaming (can return raw Response but no helpers)
- Domain CRUD handlers (routes registered, implementation is STUB)
- Node.js adapter (Bun only)

### Not Implemented ❌
- Dev server with HMR
- Graceful shutdown
- Health check endpoint
- SSR page serving
- Static file serving
- Cloudflare Workers adapter

---

## Recommendations

1. **High Priority**: Implement Domain CRUD handlers (currently stubs)
2. **High Priority**: Add Node.js adapter for broader compatibility
3. **Medium Priority**: Add graceful shutdown handling
4. **Medium Priority**: Add health check endpoint
5. **Low Priority**: Consider SSR and static file serving (may be out of scope)
