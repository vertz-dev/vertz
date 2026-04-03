# Phase 2: Route Generators & createServer Threading

## Context

Issue #2232: Make error handling dev-mode aware across all route handlers. Phase 1 added `devMode` to `entityErrorHandler`. This phase threads `devMode` through all route generators and `createServer`, and normalizes the auth catch-all.

Design doc: `plans/dev-mode-error-handling.md`

## Tasks

### Task 1: Thread devMode through entity route generator

**Files:**
- `packages/server/src/entity/route-generator.ts` (modified)
- `packages/server/src/entity/__tests__/route-generator.test.ts` (modified)

**What to implement:**

1. Add `devMode?: boolean` to `EntityRouteOptions` interface.
2. Capture `const devMode = options?.devMode` at the top of `generateEntityRoutes`.
3. Pass `{ devMode }` as the second argument to all 14 `entityErrorHandler()` call sites.

**Acceptance criteria:**
- [ ] Entity routes with `devMode: true` return real error messages for unknown errors
- [ ] Entity routes with `devMode: false` return generic messages (unchanged behavior)
- [ ] All existing entity route tests continue to pass

---

### Task 2: Reuse entityErrorHandler in service route generator

**Files:**
- `packages/server/src/service/route-generator.ts` (modified)
- `packages/server/src/service/__tests__/route-generator.test.ts` (modified)

**What to implement:**

1. Add `devMode?: boolean` to `ServiceRouteOptions` interface.
2. Import `entityErrorHandler` from `../entity/error-handler`.
3. Replace the catch block (lines 199-202) with:
   ```ts
   catch (error) {
     const result = entityErrorHandler(error, { devMode: options?.devMode });
     return jsonResponse(result.body, result.status);
   }
   ```
4. This normalizes the error code from `'InternalServerError'` to `'InternalError'` and adds proper VertzException/EntityError classification.

**Acceptance criteria:**
- [ ] Service routes with `devMode: true` return real error messages for unknown errors
- [ ] Service routes with `devMode: false` return `'InternalError'` (not `'InternalServerError'`) with generic message
- [ ] Service routes properly classify VertzException (e.g., NotFoundException → 404)
- [ ] All existing service route tests pass (update error code assertions from `'InternalServerError'` to `'InternalError'`)

---

### Task 3: Reuse entityErrorHandler in agent route generator

**Files:**
- `packages/server/src/agent/route-generator.ts` (modified)
- `packages/server/src/agent/route-generator.test.ts` (modified)

**What to implement:**

1. Add `devMode?: boolean` to `AgentRouteOptions` interface.
2. Import `entityErrorHandler` from `../entity/error-handler`.
3. Replace the generic error catch block (lines 164-168) with:
   ```ts
   const result = entityErrorHandler(error, { devMode: options?.devMode });
   return jsonResponse(result.body, result.status);
   ```
4. Keep the `isSessionError` check above — session errors still return 404 regardless of mode.
5. This normalizes the error code from `'InternalServerError'` to `'InternalError'`.

**Acceptance criteria:**
- [ ] Agent routes with `devMode: true` return real error messages for unknown errors
- [ ] Agent routes with `devMode: false` return `'InternalError'` with generic message
- [ ] SessionError still returns 404 regardless of devMode
- [ ] All existing agent route tests pass (update error code assertions from `'InternalServerError'` to `'InternalError'`)

---

### Task 4: Auth catch-all dev-mode awareness + createServer threading

**Files:**
- `packages/server/src/auth/index.ts` (modified)
- `packages/server/src/create-server.ts` (modified)

**What to implement:**

1. **Auth catch-all** (line 2735-2740): Replace with dev-mode-aware handler:
   ```ts
   catch (error) {
     if (!isProduction && error instanceof Error) {
       return new Response(
         JSON.stringify({
           error: {
             code: 'InternalError',
             message: error.message,
             ...(error.stack && { stack: error.stack }),
           },
         }),
         { status: 500, headers: { 'Content-Type': 'application/json' } },
       );
     }
     return new Response(
       JSON.stringify({
         error: {
           code: 'InternalError',
           message: 'Internal server error',
         },
       }),
       { status: 500, headers: { 'Content-Type': 'application/json' } },
     );
   }
   ```
   Note: production path changes from `{ error: string }` to `{ error: { code, message } }`.

2. **createServer** — Add `devMode?: boolean` to `ServerConfig` and derive+thread it:
   ```ts
   const devMode =
     config.devMode ??
     (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
   ```
   Pass `devMode` to all three route generator calls.

**Acceptance criteria:**
- [ ] Auth catch-all in dev mode returns real error message + stack
- [ ] Auth catch-all in production returns `{ error: { code: 'InternalError', message: 'Internal server error' } }` (structured, not string)
- [ ] `ServerConfig` accepts `devMode?: boolean` override
- [ ] `createServer` derives `devMode` from `NODE_ENV` and threads to entity, service, and agent route generators
- [ ] Quality gates pass: `bun test && bun run typecheck && bun run lint`
