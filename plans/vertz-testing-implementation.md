# @vertz/testing — Implementation Plan (Non-Compiler Features)

## Context

The `@vertz/testing` package (PR #39) ships a minimal `createTestApp()` with GET/POST, app-level mocks, and per-request middleware overrides. The testing design doc (`plans/vertz-testing-design.md`) describes a richer API. This plan implements the features that don't depend on the compiler.

---

## Blocked by Compiler (out of scope)

These features require the compiler to generate route type information:

- **Typed route strings** — autocomplete for registered routes (`app.get('/users/:id')` type-checked)
- **Typed request params/body/headers per route** — `params: { id: string }` inferred from route schema
- **Typed response body** — `res.body` narrows via `res.ok` discriminated union
- **Typed request headers per route** — headers typed from route's header schema

---

## Phases

### Phase 1: HTTP Methods (PUT, PATCH, DELETE, HEAD)

**Files:** `packages/testing/src/test-app.ts`, `packages/testing/src/__tests__/test-app.test.ts`

Currently only `.get()` and `.post()` exist. The Trie router and `NamedRouterDef` already support all methods (`get`, `post`, `put`, `patch`, `delete`, `head`).

Add to `TestApp` interface and builder:
- `.put(path, options?)` — with body support (like POST)
- `.patch(path, options?)` — with body support (like POST)
- `.delete(path, options?)` — with optional body support
- `.head(path, options?)` — no body

**Tests:**
1. PUT request with body returns response
2. PATCH request with body returns response
3. DELETE request returns response
4. HEAD request returns response (no body)

---

### Phase 2: Per-Request Service Mocks

**Files:** `packages/testing/src/test-app.ts`, `packages/testing/src/__tests__/test-app.test.ts`

Currently `TestRequestBuilder` only has `.mockMiddleware()`. The design doc shows per-request `.mock()` for services (line 104-115).

Add `.mock(service, impl)` to `TestRequestBuilder`:
- Store per-request service mocks in a Map inside `createRequestBuilder`
- Pass them through to `executeRequest` → `buildHandler`
- Merge: per-request service mocks win over app-level (same pattern as middleware mocks)

Extend `buildHandler` signature to accept `perRequestServiceMocks: Map<NamedServiceDef, unknown>`. In the service resolution loop, check per-request mocks first:
```
per-request mock → app-level mock → real service.methods({}, undefined)
```

**Tests:**
1. Per-request service mock overrides app-level mock for single request
2. App-level service mock still applies to requests without per-request override

---

### Phase 3: Typed Mock Signatures

**Files:** `packages/testing/src/test-app.ts`

The generics already exist on `NamedServiceDef<TDeps, TState, TMethods>` and `NamedMiddlewareDef<TRequires, TProvides>`. Currently the mock methods discard them (`impl: unknown`, `result: Record<string, unknown>`).

Tighten the signatures:

```typescript
// TestApp
mock<TDeps, TState, TMethods>(
  service: NamedServiceDef<TDeps, TState, TMethods>,
  impl: TMethods,
): TestApp;

mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
  middleware: NamedMiddlewareDef<TReq, TProv>,
  result: TProv,
): TestApp;
```

Same pattern on `TestRequestBuilder`:

```typescript
mock<TDeps, TState, TMethods>(
  service: NamedServiceDef<TDeps, TState, TMethods>,
  impl: TMethods,
): TestRequestBuilder;

mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
  middleware: NamedMiddlewareDef<TReq, TProv>,
  result: TProv,
): TestRequestBuilder;
```

Internal Maps stay `Map<NamedServiceDef, unknown>` — the type safety is at the call site.

**Tests:**
- Type-level tests: mock with correct shape compiles, mock with wrong shape errors
- Existing runtime tests continue to pass (no behavior change)

---

### Phase 4: Response Validation

**Files:** `packages/testing/src/test-app.ts`, `packages/testing/src/__tests__/test-app.test.ts`

`RouteConfig` already has a `response?: any` field for the response schema. When present, the test app should validate handler return values against it.

Changes:
- Store `responseSchema` in `RouteEntry` alongside handler/options/services (from `route.config.response`)
- After `await entry.handler(ctx)`, if `entry.responseSchema` exists, call `schema.safeParse(result)`
- On validation failure, throw a descriptive error (not an HTTP error — a test assertion-style error)
- Always on in test mode — matches the design doc's "Response validation always on in test mode"

**Reuse:** `route.config.response` is a `@vertz/schema` Schema with `.safeParse()` method.

**Tests:**
1. Handler return matching response schema passes
2. Handler return NOT matching response schema throws descriptive error
3. Route without response schema skips validation (no error)

---

### Phase 5: Unit Testing Services — `createTestService()`

**Files:** `packages/testing/src/test-service.ts` (new), `packages/testing/src/__tests__/test-service.test.ts` (new), `packages/testing/src/index.ts`

The design doc (lines 381-431) describes `vertz.testing.createService(serviceDef)` for isolated service testing with mock injection.

Builder API:
```typescript
createTestService(serviceDef)
  .mock(depService, mockImpl)
  .options({ ... })
  .env({ ... })
  .build()  // → returns TMethods (the service's public API)
```

Implementation:
- Accept a `NamedServiceDef<TDeps, TState, TMethods>`
- Collect mock deps, options, env via builder chain
- `.build()` resolves inject deps (using mocks), runs `onInit(deps)` (await if async), calls `methods(deps, state)`, returns result
- Return type is `Promise<TMethods>` (because `onInit` may be async)

**Tests:**
1. Build service returns methods object
2. Mocked dependencies are injected
3. Options are passed through
4. Env overrides are available
5. Async onInit is awaited before returning methods

---

## Verification

After each phase:
1. Run `cd packages/testing && npx vitest run` — all tests pass
2. Run `cd packages/core && npx vitest run` — no regressions
3. Each phase follows strict TDD (red-green-refactor)
4. Each phase gets its own PR via `/dev-workflow`
