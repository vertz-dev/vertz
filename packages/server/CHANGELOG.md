# @vertz/server

## 0.2.77

### Patch Changes

- [#2928](https://github.com/vertz-dev/vertz/pull/2928) [`9819901`](https://github.com/vertz-dev/vertz/commit/9819901b97226bbdffb090a7261ee2e3828d163c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): coerce form-encoded bodies on the server using the route schema

  Closes [#2808](https://github.com/vertz-dev/vertz/issues/2808).

  `coerceFormDataToSchema` and `coerceLeaf` now live in `@vertz/schema` so the same kernel that powers client-side `form()` coercion (#2771) runs on the server. `parseBody` in `@vertz/core` accepts an optional `coerceSchema` and now handles `multipart/form-data` in addition to `application/x-www-form-urlencoded`; entity and service route generators populate `coerceSchema` from the route's expected input shape.

  End result: the same entity works across three submit modes without validation drift.

  ```ts
  // Entity
  d.table("tasks", {
    id: d.uuid().primary(),
    title: d.text(),
    done: d.boolean().default(false),
  });

  // 1. JS form() path — already coerced on the client, sent as JSON
  fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "buy milk", done: true }),
  });

  // 2. Progressive-enhancement no-JS submit — browser sends urlencoded strings
  // <form method="post" action="/api/tasks">...</form>
  // body: title=buy+milk&done=on

  // 3. curl / agent — urlencoded with a different boolean spelling
  // curl -X POST /api/tasks --data-urlencode 'title=buy milk' --data-urlencode 'done=true'
  ```

  All three hit the handler with `{ title: 'buy milk', done: true }`. Previously modes 2 and 3 failed schema validation because checkboxes and numeric inputs arrived as strings. The coercion step runs before the CRUD pipeline's strict validation, so `EntityValidationError` semantics are unchanged when a body is actually malformed.

  The new `coerceSchema` field on `EntityRouteEntry` is separate from `bodySchema` on purpose — it coerces without enforcing app-runner-level validation, which lets entity routes keep their existing error format.

- Updated dependencies [[`81ffffe`](https://github.com/vertz-dev/vertz/commit/81ffffe18b499a18f8b83b5a78079baf40d7cc88), [`13c2ee6`](https://github.com/vertz-dev/vertz/commit/13c2ee6d7804e988e2b361af5c7e9a9c97e091ab), [`8f5b18b`](https://github.com/vertz-dev/vertz/commit/8f5b18b5d726148bc4613f28d2c752d6e5998f13), [`b7500f9`](https://github.com/vertz-dev/vertz/commit/b7500f9489d7bb65260ec7fff5f95b3fd4d95925), [`846b303`](https://github.com/vertz-dev/vertz/commit/846b303ef2a887208a397b9137cd32675a7dff4e), [`a81fd4f`](https://github.com/vertz-dev/vertz/commit/a81fd4fbd6b540ded6da83abf2d5afe35f7b242a), [`40c8a70`](https://github.com/vertz-dev/vertz/commit/40c8a70693665bf5c0a47bf957923ff57abbc41c), [`cc62c89`](https://github.com/vertz-dev/vertz/commit/cc62c89b5b126bb22a11fe1c1c89088857b3dca2), [`9819901`](https://github.com/vertz-dev/vertz/commit/9819901b97226bbdffb090a7261ee2e3828d163c)]:
  - @vertz/db@0.2.77
  - @vertz/schema@0.2.77
  - @vertz/core@0.2.77
  - @vertz/errors@0.2.77

## 0.2.76

### Patch Changes

- Updated dependencies [[`cf25bbb`](https://github.com/vertz-dev/vertz/commit/cf25bbb270186e25ca34a11f29d361e7113412bc)]:
  - @vertz/db@0.2.76
  - @vertz/core@0.2.76
  - @vertz/errors@0.2.76
  - @vertz/schema@0.2.76

## 0.2.75

### Patch Changes

- Updated dependencies [[`d0a9a2f`](https://github.com/vertz-dev/vertz/commit/d0a9a2fd27c2c69b5cddd4e5eca822915336ba53)]:
  - @vertz/db@0.2.75
  - @vertz/core@0.2.75
  - @vertz/errors@0.2.75
  - @vertz/schema@0.2.75

## 0.2.74

### Patch Changes

- [#2857](https://github.com/vertz-dev/vertz/pull/2857) [`c566a44`](https://github.com/vertz-dev/vertz/commit/c566a445bd0d46e7341a7b3b082c0a0daac96a65) Thanks [@matheuspoleza](https://github.com/matheuspoleza)! - fix(server): auth stores no longer keep the API isolate event loop alive

  `InMemoryRateLimitStore` and `InMemorySessionStore` scheduled a 60s cleanup
  `setInterval` in their constructors. When `createServer({ auth })` ran at
  module top-level inside the `vtz dev` API V8 isolate, the pending timer
  prevented `load_side_module`'s `run_event_loop()` from draining, so module
  evaluation never completed and the 10s init watchdog fired — returning
  HTTP 503 "API isolate failed to initialize" for every request.

  Cleanup is now piggybacked on `check()` / `createSession()` and runs at
  most once per `CLEANUP_INTERVAL_MS`. No background timer → no event loop
  leak. Behavior is unchanged: stale entries still expire within ~60s of the
  next store access.

  Closes #2851.

- Updated dependencies [[`b37301c`](https://github.com/vertz-dev/vertz/commit/b37301c4e18b628e1740e8bf96552348d3aad354)]:
  - @vertz/db@0.2.74
  - @vertz/core@0.2.74
  - @vertz/errors@0.2.74
  - @vertz/schema@0.2.74

## 0.2.73

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.73
  - @vertz/db@0.2.73
  - @vertz/errors@0.2.73
  - @vertz/schema@0.2.73

## 0.2.72

### Patch Changes

- Updated dependencies [[`756742c`](https://github.com/vertz-dev/vertz/commit/756742c2eb9cc95e253d441eb79ad5de7a13f25c), [`c65900b`](https://github.com/vertz-dev/vertz/commit/c65900bfa0d3f53e958526c9c0109ed32bd06511), [`8d8976d`](https://github.com/vertz-dev/vertz/commit/8d8976dd3d2d2475f37d0df79f8477fd3f58395f)]:
  - @vertz/db@0.2.72
  - @vertz/schema@0.2.72
  - @vertz/core@0.2.72
  - @vertz/errors@0.2.72

## 0.2.71

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.71
  - @vertz/db@0.2.71
  - @vertz/errors@0.2.71
  - @vertz/schema@0.2.71

## 0.2.70

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.70
  - @vertz/db@0.2.70
  - @vertz/errors@0.2.70
  - @vertz/schema@0.2.70

## 0.2.69

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.69
  - @vertz/db@0.2.69
  - @vertz/errors@0.2.69
  - @vertz/schema@0.2.69

## 0.2.68

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.68
  - @vertz/db@0.2.68
  - @vertz/errors@0.2.68
  - @vertz/schema@0.2.68

## 0.2.67

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.67
  - @vertz/db@0.2.67
  - @vertz/errors@0.2.67
  - @vertz/schema@0.2.67

## 0.2.66

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.66
  - @vertz/db@0.2.66
  - @vertz/errors@0.2.66
  - @vertz/schema@0.2.66

## 0.2.65

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.65
  - @vertz/db@0.2.65
  - @vertz/errors@0.2.65
  - @vertz/schema@0.2.65

## 0.2.64

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.64
  - @vertz/db@0.2.64
  - @vertz/errors@0.2.64
  - @vertz/schema@0.2.64

## 0.2.63

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.63
  - @vertz/db@0.2.63
  - @vertz/errors@0.2.63
  - @vertz/schema@0.2.63

## 0.2.62

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.62
  - @vertz/db@0.2.62
  - @vertz/errors@0.2.62
  - @vertz/schema@0.2.62

## 0.2.61

### Patch Changes

- [#2590](https://github.com/vertz-dev/vertz/pull/2590) [`6889e4d`](https://github.com/vertz-dev/vertz/commit/6889e4df58deca0e2cb44067bc5d070eba9e431b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server,testing): align .test-d.ts type tests with current API surface

- Updated dependencies []:
  - @vertz/db@0.2.61
  - @vertz/core@0.2.61
  - @vertz/errors@0.2.61
  - @vertz/schema@0.2.61

## 0.2.60

### Patch Changes

- [#2528](https://github.com/vertz-dev/vertz/pull/2528) [`8cc3a59`](https://github.com/vertz-dev/vertz/commit/8cc3a5994b11bbcbd2544238787516e8f293efc9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Guard cloud auth and provider tests behind env var checks so they skip gracefully when credentials are missing. Also fix `describe.skip` propagation to nested suites in the vtz test runner.

- Updated dependencies []:
  - @vertz/core@0.2.60
  - @vertz/db@0.2.60
  - @vertz/errors@0.2.60
  - @vertz/schema@0.2.60

## 0.2.59

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.59
  - @vertz/db@0.2.59
  - @vertz/errors@0.2.59
  - @vertz/schema@0.2.59

## 0.2.58

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.58
  - @vertz/db@0.2.58
  - @vertz/errors@0.2.58
  - @vertz/schema@0.2.58

## 0.2.57

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.57
  - @vertz/db@0.2.57
  - @vertz/errors@0.2.57
  - @vertz/schema@0.2.57

## 0.2.56

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.56
  - @vertz/db@0.2.56
  - @vertz/errors@0.2.56
  - @vertz/schema@0.2.56

## 0.2.55

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.55
  - @vertz/db@0.2.55
  - @vertz/errors@0.2.55
  - @vertz/schema@0.2.55

## 0.2.54

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.54
  - @vertz/db@0.2.54
  - @vertz/errors@0.2.54
  - @vertz/schema@0.2.54

## 0.2.53

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.53
  - @vertz/db@0.2.53
  - @vertz/errors@0.2.53
  - @vertz/schema@0.2.53

## 0.2.52

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.52
  - @vertz/db@0.2.52
  - @vertz/errors@0.2.52
  - @vertz/schema@0.2.52

## 0.2.51

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.51
  - @vertz/db@0.2.51
  - @vertz/errors@0.2.51
  - @vertz/schema@0.2.51

## 0.2.50

### Patch Changes

- [#2385](https://github.com/vertz-dev/vertz/pull/2385) [`37247bd`](https://github.com/vertz-dev/vertz/commit/37247bd6b07b4cf1ca3ca897b67b3cfccf525e53) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): service action custom `path` now respects the API prefix

  Previously, providing a custom `path` on a service action would bypass the API prefix entirely (e.g., `path: '/webhooks/stripe'` produced `/webhooks/stripe` instead of `/api/webhooks/stripe`). Custom paths are now always prefixed with the configured API prefix, consistent with entity custom action behavior.

- Updated dependencies [[`5ab022d`](https://github.com/vertz-dev/vertz/commit/5ab022d712d2bf297e5ecec9907045b5fe7154ec)]:
  - @vertz/db@0.2.50
  - @vertz/core@0.2.50
  - @vertz/errors@0.2.50
  - @vertz/schema@0.2.50

## 0.2.49

### Patch Changes

- Updated dependencies [[`3eacdf7`](https://github.com/vertz-dev/vertz/commit/3eacdf7281ef3bace92abf0d3eddd06f8cbbf32a)]:
  - @vertz/db@0.2.49
  - @vertz/core@0.2.49
  - @vertz/errors@0.2.49
  - @vertz/schema@0.2.49

## 0.2.48

### Patch Changes

- [#2294](https://github.com/vertz-dev/vertz/pull/2294) [`fcf3524`](https://github.com/vertz-dev/vertz/commit/fcf352437f504c4e67b6ce231ebceeb1476c014f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): conditional BaseContext types via typed() factory (#2004)

  BaseContext is now generic over ContextFeatures. Auth/tenancy fields only
  appear on ctx when configured. Use typed(auth) to get narrowed entity()
  and service() factories. Existing code is unaffected — BaseContext without
  a type parameter defaults to FullFeatures (all fields present).

- [#2311](https://github.com/vertz-dev/vertz/pull/2311) [`e11ac56`](https://github.com/vertz-dev/vertz/commit/e11ac56ab9361259f0ca428f8f7cb8c9d287df6e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(auth): resolveAllLimitStates uses level-specific defaultPlan in multi-level mode

  When a subscription expires in multi-level billing, `resolveAllLimitStates` now uses the per-level default plan (`defaultPlans[entry.type]`) instead of the global `defaultPlan`. Fixes inconsistency where gate check and limit resolution could fall back to different plans.

- Updated dependencies [[`9fd72d7`](https://github.com/vertz-dev/vertz/commit/9fd72d7b11e0d4890556d89ef29d1a6e050619b1), [`5d23ced`](https://github.com/vertz-dev/vertz/commit/5d23ced8c21e9cd6a3224e8baea78fedd86d1e1b)]:
  - @vertz/db@0.2.48
  - @vertz/core@0.2.48
  - @vertz/errors@0.2.48
  - @vertz/schema@0.2.48

## 0.2.47

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.47
  - @vertz/db@0.2.47
  - @vertz/errors@0.2.47
  - @vertz/schema@0.2.47

## 0.2.46

### Patch Changes

- [#2239](https://github.com/vertz-dev/vertz/pull/2239) [`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): allow customizing or removing the `/api/` route prefix (#2131)

  - `createServer({ apiPrefix: '/v1' })` changes all generated routes from `/api/*` to `/v1/*`
  - API-only apps can use `apiPrefix: ''` to mount routes at the root
  - Full-stack apps require a non-empty prefix (enforced at dev server and Cloudflare handler)
  - Auth cookie paths (`Path=`) automatically follow the resolved prefix
  - Cloudflare handler reads `app.apiPrefix` at runtime when not explicitly configured
  - `basePath` option in `@vertz/cloudflare` renamed to `apiPrefix` for consistency

- Updated dependencies [[`d029bfc`](https://github.com/vertz-dev/vertz/commit/d029bfcef05d9226f6740b5854827904144dc7ba)]:
  - @vertz/core@0.2.46
  - @vertz/db@0.2.46
  - @vertz/errors@0.2.46
  - @vertz/schema@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.45
  - @vertz/db@0.2.45
  - @vertz/errors@0.2.45
  - @vertz/schema@0.2.45

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.44
  - @vertz/db@0.2.44
  - @vertz/errors@0.2.44
  - @vertz/schema@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.43
  - @vertz/db@0.2.43
  - @vertz/errors@0.2.43
  - @vertz/schema@0.2.43

## 0.2.42

### Patch Changes

- [#2103](https://github.com/vertz-dev/vertz/pull/2103) [`3817268`](https://github.com/vertz-dev/vertz/commit/381726859926747bb460433e629a52d5277cb3ad) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OpenAPI 3.1 spec generation and auto-serving: `getOpenAPISpec()` on `createServer`, auto-serve at `/api/openapi.json`, service route support in spec generation, and `vertz_get_api_spec` MCP tool with tag-based filtering

- Updated dependencies []:
  - @vertz/core@0.2.42
  - @vertz/db@0.2.42
  - @vertz/errors@0.2.42
  - @vertz/schema@0.2.42

## 0.2.41

### Patch Changes

- [#2003](https://github.com/vertz-dev/vertz/pull/2003) [`54d9ab0`](https://github.com/vertz-dev/vertz/commit/54d9ab09dd200700eee78880a200e1fecec057f6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `action()` helper for typed action I/O in entity and service definitions.

  - `action()` wraps action configs to infer `input` type from `body` schema and check `return` type against `response` schema
  - Fix service `TCtx` constraint: `ctx` is now typed as `ServiceContext<TInject>` for inline service actions (without `action()`)
  - Add `__actions` phantom type to `EntityDefinition` for downstream type extraction
  - New exports: `action`, `ActionDef`, `ActionDefNoBody`

- Updated dependencies []:
  - @vertz/core@0.2.41
  - @vertz/db@0.2.41
  - @vertz/errors@0.2.41
  - @vertz/schema@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.40
  - @vertz/db@0.2.40
  - @vertz/errors@0.2.40
  - @vertz/schema@0.2.40

## 0.2.39

### Patch Changes

- [#1949](https://github.com/vertz-dev/vertz/pull/1949) [`7bf733f`](https://github.com/vertz-dev/vertz/commit/7bf733fec92424d08a08dafe3b4c4a5984f084b0) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - chore(auth): align AccessEventBroadcaster with (resourceType, resourceId) pattern

  AccessEvent type and broadcast method signatures now use (orgId, resourceType, resourceId, ...) instead of bare orgId. ClientAccessEvent includes resourceType/resourceId for client-side resource-level filtering. WebSocket connection routing unchanged.

- [#1947](https://github.com/vertz-dev/vertz/pull/1947) [`987a9b9`](https://github.com/vertz-dev/vertz/commit/987a9b9412d61fa3be3387373cc39c87a47676c5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(auth): deep-freeze LimitDef.overage sub-object in defineAccess()

  The shallow `Object.freeze({ ...v })` on LimitDef left the nested `overage` config mutable. Now freezes the overage sub-object when present.

- [#1953](https://github.com/vertz-dev/vertz/pull/1953) [`883b9fc`](https://github.com/vertz-dev/vertz/commit/883b9fc46177bd63d62d4b9da19f7c1bae2d26a2) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Align OverrideStore and WalletStore with (resourceType, resourceId) pattern for multi-level tenancy support

- Updated dependencies []:
  - @vertz/core@0.2.39
  - @vertz/db@0.2.39
  - @vertz/errors@0.2.39
  - @vertz/schema@0.2.39

## 0.2.38

### Patch Changes

- [#1945](https://github.com/vertz-dev/vertz/pull/1945) [`37fc3c1`](https://github.com/vertz-dev/vertz/commit/37fc3c133be037ec139d93b6e9894ccad5bfac15) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): align auth_flags with (resource_type, resource_id) pattern

  FlagStore interface now uses `(resourceType, resourceId, flag)` instead of `(tenantId, flag)`.
  This aligns with the composite key pattern used by SubscriptionStore, ClosureStore, and other auth stores.

  Breaking change: all FlagStore method signatures updated from 2/3 args to 3/4 args.

- Updated dependencies []:
  - @vertz/core@0.2.38
  - @vertz/db@0.2.38
  - @vertz/errors@0.2.38
  - @vertz/schema@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.37
  - @vertz/db@0.2.37
  - @vertz/errors@0.2.37
  - @vertz/schema@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.36
  - @vertz/db@0.2.36
  - @vertz/errors@0.2.36
  - @vertz/schema@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.35
  - @vertz/db@0.2.35
  - @vertz/errors@0.2.35
  - @vertz/schema@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.34
  - @vertz/db@0.2.34
  - @vertz/errors@0.2.34
  - @vertz/schema@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.33
  - @vertz/db@0.2.33
  - @vertz/errors@0.2.33
  - @vertz/schema@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.32
  - @vertz/db@0.2.32
  - @vertz/errors@0.2.32
  - @vertz/schema@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies [[`75ed113`](https://github.com/vertz-dev/vertz/commit/75ed113c54cf7fdf0d928a300f71fadd58e27ebe)]:
  - @vertz/db@0.2.31
  - @vertz/core@0.2.31
  - @vertz/errors@0.2.31
  - @vertz/schema@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies [[`e75e501`](https://github.com/vertz-dev/vertz/commit/e75e5014917608b33fca1668e275948e16a0d773), [`126bff9`](https://github.com/vertz-dev/vertz/commit/126bff96c0b09b5ab954ca7130857fbca165327e)]:
  - @vertz/core@0.2.30
  - @vertz/db@0.2.30
  - @vertz/errors@0.2.30
  - @vertz/schema@0.2.30

## 0.2.29

### Patch Changes

- [#1789](https://github.com/vertz-dev/vertz/pull/1789) [`0cc2ec8`](https://github.com/vertz-dev/vertz/commit/0cc2ec873c876d9549d0959b7614d823818a8fd9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): make JWT signing algorithm configurable (ES256, RS256)

  Add `session.algorithm` option to `createAuth()`. Defaults to `'RS256'` (no breaking change). Supports `'ES256'` for smaller signatures and better edge runtime performance.

  - `createJWT()`/`verifyJWT()` accept algorithm parameter
  - Dev key generation branches on algorithm (RSA vs EC P-256)
  - Key-algorithm mismatch validated at startup with clear errors
  - JWKS endpoint dynamically returns correct `alg`/`kty`
  - `createCloudJWTVerifier` accepts configurable `algorithms` array
  - SSR resolver threads algorithm through to verification

- [#1773](https://github.com/vertz-dev/vertz/pull/1773) [`04c9578`](https://github.com/vertz-dev/vertz/commit/04c95786538a722d987fe190f0c0efc4f82cfdce) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix resolvePrimaryKey() in tenant-chain to throw for composite primary keys instead of silently picking the first PK column, consistent with the entity CRUD guard.

- [#1784](https://github.com/vertz-dev/vertz/pull/1784) [`6829e22`](https://github.com/vertz-dev/vertz/commit/6829e2241b7e0f776b093f9a7e408d927f8cd627) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `/v1` prefix from cloud auth proxy paths (`/auth/v1/<path>` → `/auth/<path>`)

- [#1785](https://github.com/vertz-dev/vertz/pull/1785) [`d195e05`](https://github.com/vertz-dev/vertz/commit/d195e05e2abc759967ef1c82039297e651bd06ed) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add createTestClient() with typed entity/service proxies for 100% type-safe server testing. Entity proxy provides typed create/list/get/update/delete. Service proxy provides direct method access with typed body/response. Adds phantom type pattern to ServiceDefinition for type preservation.

- Updated dependencies [[`a5a3d78`](https://github.com/vertz-dev/vertz/commit/a5a3d7880cb18dc09c10ea061308188c3560e0f6)]:
  - @vertz/db@0.2.29
  - @vertz/core@0.2.29
  - @vertz/errors@0.2.29
  - @vertz/schema@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.28
  - @vertz/db@0.2.28
  - @vertz/errors@0.2.28
  - @vertz/schema@0.2.28

## 0.2.27

### Patch Changes

- [#1768](https://github.com/vertz-dev/vertz/pull/1768) [`73c2d0d`](https://github.com/vertz-dev/vertz/commit/73c2d0db2f9cdab495ade4ee5815e071f8411587) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(db): add composite primary key support to d.table()

  Tables can now define composite primary keys via a table-level `primaryKey` option:

  ```ts
  const tenantMembers = d.table(
    "tenant_members",
    {
      tenantId: d.uuid(),
      userId: d.uuid(),
      role: d.text().default("member"),
    },
    { primaryKey: ["tenantId", "userId"] }
  );
  ```

  - `primaryKey` is type-constrained to valid column names (compile-time error for typos)
  - Composite PK columns are required in `$insert` and `$create_input` (no auto-generation)
  - Composite PK columns are excluded from `$update` and `$update_input`
  - Existing `.primary()` API unchanged (backward compatible)
  - Migration SQL generator already handles composite PKs
  - Differ warns on PK flag changes (no ALTER SQL emitted)
  - Entity CRUD pipeline throws clear error for composite-PK tables (not yet supported)

- [#1764](https://github.com/vertz-dev/vertz/pull/1764) [`6acb2f3`](https://github.com/vertz-dev/vertz/commit/6acb2f3af3e7ac0fe41aec7dff6913eb8311921d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `response()` helper for custom response headers and status codes in service and entity action handlers. Handlers can now return `response(data, { headers, status })` to customize the HTTP response while keeping backward compatibility with plain return values.

- Updated dependencies [[`73c2d0d`](https://github.com/vertz-dev/vertz/commit/73c2d0db2f9cdab495ade4ee5815e071f8411587), [`aa704de`](https://github.com/vertz-dev/vertz/commit/aa704de973e3f661e297d1a3cd2aef6cabdfd02c)]:
  - @vertz/db@0.2.27
  - @vertz/core@0.2.27
  - @vertz/errors@0.2.27
  - @vertz/schema@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.26
  - @vertz/db@0.2.26
  - @vertz/errors@0.2.26
  - @vertz/schema@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.25
  - @vertz/db@0.2.25
  - @vertz/errors@0.2.25
  - @vertz/schema@0.2.25

## 0.2.24

### Patch Changes

- [#1686](https://github.com/vertz-dev/vertz/pull/1686) [`15dbd75`](https://github.com/vertz-dev/vertz/commit/15dbd75e6e8f2fa5d96c28f498b0d3cac0603945) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): extract auth session middleware and add integration tests

  `createServer()` with `auth` now auto-wires a session middleware that bridges JWT session data (`userId`, `tenantId`, `roles`) into the entity/service handler context. The inline middleware has been extracted to `createAuthSessionMiddleware()` in the auth module for testability and separation of concerns.

- [#1705](https://github.com/vertz-dev/vertz/pull/1705) [`61cd174`](https://github.com/vertz-dev/vertz/commit/61cd174a6f54f756d019533089c65c02ef76900f) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix entity route handlers receiving empty `ctx.entity` instead of actual entity operations from the registry. The `makeEntityCtx` helper now always resolves entity operations via `registry.get()` instead of silently falling back to an empty object. Hooks (`before.create`, `after.update`, etc.) and action handlers now correctly receive `ctx.entity` with all CRUD methods populated.

- [#1692](https://github.com/vertz-dev/vertz/pull/1692) [`99c90d9`](https://github.com/vertz-dev/vertz/commit/99c90d9d9176722d60d998a5a8d1eeaf4146c8de) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix resolveVertzQL to keep where/orderBy/limit as flat query params instead of encoding them in the base64 q= parameter. Only select and include are encoded in q= (structural, not human-readable). Where is flattened to bracket notation (where[field]=value), orderBy to colon format (orderBy=field:dir), and limit stays as a raw number. Server parser updated to support comma-separated multi-field orderBy.

- Updated dependencies []:
  - @vertz/core@0.2.24
  - @vertz/db@0.2.24
  - @vertz/errors@0.2.24
  - @vertz/schema@0.2.24

## 0.2.23

### Patch Changes

- [#1561](https://github.com/vertz-dev/vertz/pull/1561) [`676e600`](https://github.com/vertz-dev/vertz/commit/676e60040f3b92ac85b04cb93f1da1f3266dcd72) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix quarterly interval dropping interval_count when building Stripe price params — quarterly plans were silently created as monthly (#1557)

- [#1563](https://github.com/vertz-dev/vertz/pull/1563) [`b1ae03f`](https://github.com/vertz-dev/vertz/commit/b1ae03fb1fe1b86bf4120ba63ec4e978a6193395) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix matchingPrice check in Stripe adapter to compare recurring interval and interval_count, not just unit_amount — prevents silent interval drift when syncing plans (#1560)

- Updated dependencies []:
  - @vertz/core@0.2.23
  - @vertz/db@0.2.23
  - @vertz/errors@0.2.23
  - @vertz/schema@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies [[`59a7f9b`](https://github.com/vertz-dev/vertz/commit/59a7f9bf484c14288b0ca10e0f96c015f3d928bc)]:
  - @vertz/db@0.2.22
  - @vertz/core@0.2.22
  - @vertz/errors@0.2.22
  - @vertz/schema@0.2.22

## 0.2.21

### Patch Changes

- [#1322](https://github.com/vertz-dev/vertz/pull/1322) [`786f057`](https://github.com/vertz-dev/vertz/commit/786f057d44a094c6685371706f22201c87ad26a1) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add cloud-managed auth infrastructure: JWKS client, RS256 JWT verifier, auth proxy with circuit breaker, provider cloud config union types, lifecycle callbacks, and SSR cloud verifier support.

- [#1459](https://github.com/vertz-dev/vertz/pull/1459) [`6862ac1`](https://github.com/vertz-dev/vertz/commit/6862ac1559ddba889cc9f0190e5266a0e5f4145a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): add defineAuth() and defineEntities() for extractable, type-safe config

- [#1464](https://github.com/vertz-dev/vertz/pull/1464) [`4637095`](https://github.com/vertz-dev/vertz/commit/46370950e7f1e1f3247a945511500d8f1c3e1d76) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Migrate JWT from symmetric HS256 to asymmetric RS256 key pairs. Config now accepts `privateKey`/`publicKey` PEM strings instead of `jwtSecret`. Dev mode auto-generates RSA key pair to `.vertz/`. Public key exposed at `/.well-known/jwks.json`.

- [#1397](https://github.com/vertz-dev/vertz/pull/1397) [`8873a05`](https://github.com/vertz-dev/vertz/commit/8873a052da73ab1f3d96c8680f3a6ecb40022285) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(server): add rules.\* serialization for cloud deploy-time extraction

- [#1493](https://github.com/vertz-dev/vertz/pull/1493) [`2672525`](https://github.com/vertz-dev/vertz/commit/26725257feb8570fab7e924b3d39a283b359608c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support custom tenant FK column names in entity CRUD pipeline. The tenant column is now resolved from the model's `_tenant` relation FK instead of being hardcoded to `tenantId`. Apps can use `workspaceId`, `orgId`, or any column name as long as the model declares a tenant relation pointing to it.

- Updated dependencies [[`a897b19`](https://github.com/vertz-dev/vertz/commit/a897b19b36f0851e373f4dce31298c52c11328c7)]:
  - @vertz/db@0.2.21
  - @vertz/core@0.2.21
  - @vertz/errors@0.2.21
  - @vertz/schema@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.20
  - @vertz/db@0.2.20
  - @vertz/errors@0.2.20
  - @vertz/schema@0.2.20

## 0.2.19

### Patch Changes

- [#1266](https://github.com/vertz-dev/vertz/pull/1266) [`ae1a64a`](https://github.com/vertz-dev/vertz/commit/ae1a64a23608880b8e87ed2a44907eabddba873e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OpenAPI 3.1 spec generation from entity definitions. The `generateOpenAPISpec()` function produces a complete OpenAPI document from entity `expose` configs, including response schemas, create/update input schemas, VertzQL query parameters, relation includes, custom actions, and standard error responses.

- Updated dependencies []:
  - @vertz/core@0.2.19
  - @vertz/db@0.2.19
  - @vertz/errors@0.2.19
  - @vertz/schema@0.2.19

## 0.2.18

### Patch Changes

- [#1263](https://github.com/vertz-dev/vertz/pull/1263) [`2406b51`](https://github.com/vertz-dev/vertz/commit/2406b5145360694def02081756c980bc58879bda) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): extract where/orderBy/limit from q= base64 JSON parameter

  The q= parameter parser silently dropped where, orderBy, and limit from the
  decoded JSON even though they were allowed keys. Clients could send filtered
  queries via q= and get unfiltered results with no error. Now properly extracts
  and merges these fields with URL params.

- [#1261](https://github.com/vertz-dev/vertz/pull/1261) [`0e3156a`](https://github.com/vertz-dev/vertz/commit/0e3156afd8d3dea6cdb59fd26657f53558c408cc) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): AuthInstance.resolveSessionForSSR now assignable to SessionResolver

  Updated the return type of `resolveSessionForSSR` on `AuthInstance` to use the
  correct `{ id: string; email: string; role: string }` user shape and `AccessSet | null`
  for `accessSet`, matching what the implementation already returns. Previously typed
  loosely as `Record<string, unknown>` / `unknown`, which caused a type error when
  passed to `createBunDevServer`'s `sessionResolver` option.

- [#1262](https://github.com/vertz-dev/vertz/pull/1262) [`e015221`](https://github.com/vertz-dev/vertz/commit/e015221049179a19e260a3a6fdd46ec9557e7777) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(server): POST /query now validates cursor length at route level

  The POST /query endpoint was passing `body.after` directly to the CRUD pipeline
  without checking its length. The GET route used `parseVertzQL` which goes through
  the pipeline's silent 512-char guard, but POST /query bypassed this. Now returns
  400 BadRequest when the cursor exceeds MAX_CURSOR_LENGTH (512).

- Updated dependencies []:
  - @vertz/core@0.2.18
  - @vertz/db@0.2.18
  - @vertz/errors@0.2.18
  - @vertz/schema@0.2.18

## 0.2.17

### Patch Changes

- [#1237](https://github.com/vertz-dev/vertz/pull/1237) [`e69ef45`](https://github.com/vertz-dev/vertz/commit/e69ef4540fca9e47249fc18c3cd2a74be84f2db8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add Entity Expose API — unified `expose` config replacing `relations` for controlling VertzQL query surface.

  - `expose.select` restricts which fields appear in API responses
  - `expose.allowWhere` / `expose.allowOrderBy` restrict filtering and sorting
  - `expose.include` controls relation exposure with fractal structure
  - Field-level access descriptors (`rules.*`) for conditional field visibility
  - Descriptor-guarded fields return `null` (not field omission)

- Updated dependencies []:
  - @vertz/core@0.2.17
  - @vertz/db@0.2.17
  - @vertz/errors@0.2.17
  - @vertz/schema@0.2.17

## 0.2.16

### Patch Changes

- [#1165](https://github.com/vertz-dev/vertz/pull/1165) [`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Thread TModel generic through createActionHandler for typed row and context in custom entity actions

- [#1179](https://github.com/vertz-dev/vertz/pull/1179) [`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add transaction support to DatabaseClient with full model delegates

  - `db.transaction(async (tx) => { ... })` wraps multiple operations atomically
  - `TransactionClient` provides the same model delegates as `DatabaseClient` (`tx.users.create()`, `tx.tasks.list()`, etc.)
  - PostgreSQL uses `sql.begin()` for connection-scoped transactions
  - SQLite uses `BEGIN`/`COMMIT`/`ROLLBACK` via single-connection queryFn
  - Auth plan store operations (`assignPlan`, `removePlan`, `updateOverrides`) now use transactions for atomicity
  - Failure injection tests verify rollback behavior

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1165](https://github.com/vertz-dev/vertz/pull/1165) [`15511ba`](https://github.com/vertz-dev/vertz/commit/15511ba68fe78c99ba7d056ef17db94d8380f9fa) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Thread TModel generic through CrudHandlers and createCrudHandlers for typed row returns and context in CRUD operations

- [#1212](https://github.com/vertz-dev/vertz/pull/1212) [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(db): handle null direct values in where clause as IS NULL

  Previously, passing `null` as a direct value in a where clause (e.g., `{ revokedAt: null }`)
  generated `column = $N` with a null parameter, which in SQL always evaluates to NULL (not TRUE),
  silently breaking the entire WHERE clause. Now correctly generates `column IS NULL`.

  Also reverts DbSessionStore raw SQL workarounds back to ORM-based `get()` calls.

- [#1218](https://github.com/vertz-dev/vertz/pull/1218) [`8c707ca`](https://github.com/vertz-dev/vertz/commit/8c707ca055f965526b043567b93844343e7a51e8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix OAuth error redirect URL construction to use the URL constructor instead of string concatenation. Handles URL fragments, existing query params, duplicate error params, and absolute URLs correctly.

- [#1216](https://github.com/vertz-dev/vertz/pull/1216) [`c1c0638`](https://github.com/vertz-dev/vertz/commit/c1c06383b8ad50c833b64aa5009fe7b494bb559b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - SSR session injection to eliminate auth loading flash. JWT session data is now injected as `window.__VERTZ_SESSION__` during SSR, so `AuthProvider` hydrates with session data immediately instead of showing a loading state. Zero-config: the CLI auto-wires the session resolver when auth is configured.

- [#1201](https://github.com/vertz-dev/vertz/pull/1201) [`5dfaebc`](https://github.com/vertz-dev/vertz/commit/5dfaebc83853922f08120c2b5e56af7998752a00) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Refactor plan storage to subscription-based tenant architecture

  - `PlanStore` → `SubscriptionStore`, `OrgPlan` → `Subscription`, methods simplified (`assign`, `get`, `remove`)
  - `DbPlanStore` → `DbSubscriptionStore`, `InMemoryPlanStore` → `InMemorySubscriptionStore`
  - All store interfaces (`SubscriptionStore`, `FlagStore`, `WalletStore`) now use `tenantId` instead of `orgId`
  - Removed `plan` field from `AuthUser`, `ReservedSignUpField`, `UserTableEntry`, and `auth_users` DDL
  - `computeAccessSet()` resolves plan via `subscriptionStore.get(tenantId)` instead of `user.plan` parameter
  - `AuthAccessConfig` now accepts `subscriptionStore` and `walletStore`

- [#1221](https://github.com/vertz-dev/vertz/pull/1221) [`667453b`](https://github.com/vertz-dev/vertz/commit/667453bb8011aecaba4cbc79b816409cc8cbc744) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `requestHandler` to `ServerInstance` — a unified handler that routes auth requests (`/api/auth/*`) to `auth.handler` and everything else to the entity handler. Eliminates the manual if/else routing boilerplate every auth-enabled app previously required.

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

- Updated dependencies [[`2f574cc`](https://github.com/vertz-dev/vertz/commit/2f574cce9e941c63503efb2e32ecef7b53951725), [`391096b`](https://github.com/vertz-dev/vertz/commit/391096b426e1debb6cee06b336768b0e20abc191), [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/db@0.2.16
  - @vertz/core@0.2.16
  - @vertz/errors@0.2.16
  - @vertz/schema@0.2.16

## 0.2.15

### Patch Changes

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Redesign access control system with entity-centric `defineAccess()`, plan features/limits with multi-limit resolution, override store with overage billing, plan versioning with grandfathering and grace periods, billing adapter interface with Stripe implementation, and client-side plan event broadcasting.

- [#1086](https://github.com/vertz-dev/vertz/pull/1086) [`4a2d5b5`](https://github.com/vertz-dev/vertz/commit/4a2d5b504791ee772396248789b9ad65bd078abf) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add DB-backed auth store implementations (DbUserStore, DbSessionStore, DbRoleAssignmentStore, DbClosureStore, DbFlagStore, DbPlanStore, DbOAuthAccountStore) with dialect-aware DDL for SQLite and PostgreSQL. Export authModels, initializeAuthTables, validateAuthModels, and all DB store classes from @vertz/server.

- Updated dependencies []:
  - @vertz/core@0.2.15
  - @vertz/db@0.2.15
  - @vertz/errors@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.14
  - @vertz/db@0.2.14
  - @vertz/errors@0.2.14

## 0.2.13

### Patch Changes

- [#1046](https://github.com/vertz-dev/vertz/pull/1046) [`337e1b3`](https://github.com/vertz-dev/vertz/commit/337e1b3dfca6768575e57cf54069beb4f37366b7) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Access Set Bootstrap + Client-Side can(): server computes global entitlement snapshots (computeAccessSet), embeds in JWT acl claim with 2KB overflow strategy, exposes GET /api/auth/access-set with ETag/304 support. Client-side can() function returns reactive AccessCheck signals, AccessGate blocks UI while loading, createAccessProvider hydrates from SSR-injected **VERTZ_ACCESS_SET**. computeEntityAccess() enables per-entity access metadata for can(entitlement, entity). Compiler recognizes can() as signal-api via reactivity manifest.

- [#1066](https://github.com/vertz-dev/vertz/pull/1066) [`2f6d58a`](https://github.com/vertz-dev/vertz/commit/2f6d58a818d0ecbbd7999b0bfc072e2424640f59) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Make all auth store interfaces async (RateLimitStore, ClosureStore, RoleAssignmentStore, PlanStore) for KV/Redis compatibility

- [#1025](https://github.com/vertz-dev/vertz/pull/1025) [`58fffce`](https://github.com/vertz-dev/vertz/commit/58fffceb6c4e1660fb3d4d1891cd4ce662dca22b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Dual-token sessions: replace single 7-day JWT with 60-second JWT (`vertz.sid`) + 7-day opaque refresh token (`vertz.ref`) stored hashed in session store. Adds token rotation with 10-second idempotent grace period, session management API (list/revoke/revoke-all), device name parsing, and pluggable store interfaces (SessionStore, UserStore, RateLimitStore). Decomposes auth monolith into focused modules.

- [#1040](https://github.com/vertz-dev/vertz/pull/1040) [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add email verification and password reset flows to auth module.

  - Email verification: opt-in via `emailVerification` config, sends token on signup via `onSend` callback
  - POST /api/auth/verify-email — validates token, marks emailVerified: true
  - POST /api/auth/resend-verification — rate limited 3/hour per userId
  - Password reset: opt-in via `passwordReset` config with `onSend` callback
  - POST /api/auth/forgot-password — always returns 200 (prevents email enumeration)
  - POST /api/auth/reset-password — validates token, updates password, revokes sessions
  - New error types: TokenExpiredError, TokenInvalidError
  - New stores: InMemoryEmailVerificationStore, InMemoryPasswordResetStore

- [#1037](https://github.com/vertz-dev/vertz/pull/1037) [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add MFA/TOTP support with backup codes and step-up authentication.

  - TOTP (RFC 6238) generation and verification
  - MFA setup, verify, disable, and backup code routes
  - MFA challenge flow: signIn returns MFA_REQUIRED when MFA is enabled
  - Step-up authentication with `fva` (factor verification age) JWT claim
  - `checkFva()` utility for protecting sensitive operations
  - `InMemoryMFAStore` for development/testing
  - New MFA error types: MFA_REQUIRED, MFA_INVALID_CODE, MFA_ALREADY_ENABLED, MFA_NOT_ENABLED

- [#1034](https://github.com/vertz-dev/vertz/pull/1034) [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add OAuth provider support (Google, GitHub, Discord) with PKCE, encrypted state cookies, and automatic account linking.

- [#1047](https://github.com/vertz-dev/vertz/pull/1047) [`d4af7d0`](https://github.com/vertz-dev/vertz/commit/d4af7d0fa0ff1f3cfc21625e9bd16621f833f9cd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): plans & wallet — Layer 4/5 plan checks, wallet limits, canAndConsume/unconsume

  Adds SaaS plan and wallet infrastructure to the auth system:

  - `defineAccess()` now accepts `plans` config with entitlements and limits
  - `PlanStore` / `InMemoryPlanStore` for org-to-plan assignments with expiration and overrides
  - `WalletStore` / `InMemoryWalletStore` for consumption tracking with atomic check-and-increment
  - `calculateBillingPeriod()` for period-anchored billing calculations
  - Layer 4 (plan check) and Layer 5 (wallet check) in `can()` and `check()`
  - `canAndConsume()` — atomic access check + wallet increment
  - `unconsume()` — rollback after operation failure
  - `computeAccessSet()` enrichment with limit info for JWT embedding
  - Plan expiration with free fallback
  - Per-customer overrides via `max(override, plan_limit)`

- [#1063](https://github.com/vertz-dev/vertz/pull/1063) [`a82b2ec`](https://github.com/vertz-dev/vertz/commit/a82b2ec1ccc94f278916796783c33d81ffead211) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Feature flag store + reactive access invalidation: InMemoryFlagStore implements per-tenant boolean feature flags. Layer 1 in createAccessContext() now evaluates flag requirements on entitlements — disabled flags produce 'flag_disabled' denial with meta.disabledFlags. computeAccessSet() populates real flag state from FlagStore. Access event broadcaster provides authenticated WebSocket broadcasting for flag_toggled, limit_updated, role_changed, and plan_changed events. Client-side access event client connects with exponential backoff reconnection (1s–30s cap, ±25% jitter). handleAccessEvent() performs inline signal updates for flag/limit changes; role/plan changes trigger jittered refetch. AuthProvider accepts accessEvents prop to wire WebSocket events into the reactive access cascade.

- [#1039](https://github.com/vertz-dev/vertz/pull/1039) [`45e84cf`](https://github.com/vertz-dev/vertz/commit/45e84cf2f11123bf3ed66ae8cf311efc1393238c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(auth): resource hierarchy with closure table, role inheritance, and defineAccess()

  Introduces hierarchical RBAC replacing flat createAccess():

  - `defineAccess()` with hierarchy, roles, inheritance, and entitlements config
  - `rules.*` builders: role(), entitlement(), where(), all(), any(), authenticated(), fva()
  - InMemoryClosureStore for resource hierarchy (4-level depth cap)
  - InMemoryRoleAssignmentStore with inheritance resolution (additive, most permissive wins)
  - `createAccessContext()` with can(), check(), authorize(), canAll()
  - Five-layer resolution engine (flags and plan/wallet stubbed for Phase 8/9)

- [#1052](https://github.com/vertz-dev/vertz/pull/1052) [`4eac71c`](https://github.com/vertz-dev/vertz/commit/4eac71c98369d12a0cd7a3cbbeda60ea7cc5bd05) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add client-side auth session management (AuthProvider, useAuth, AuthGate)

  - AuthProvider wraps app with auth context, manages JWT session lifecycle
  - useAuth() returns reactive state + SdkMethods (signIn, signUp, signOut, mfaChallenge, forgotPassword, resetPassword)
  - SdkMethods work with form() for automatic validation and submission
  - Proactive token refresh scheduling (10s before expiry, tab visibility, online/offline handling)
  - AuthGate gates rendering on auth state resolution (shows fallback during loading)
  - SSR hydration via window.**VERTZ_SESSION** (no initial fetch needed)
  - AccessContext integration: AuthProvider auto-manages access set when accessControl=true
  - Server: signin/signup/refresh responses now include expiresAt timestamp

- [#967](https://github.com/vertz-dev/vertz/pull/967) [`eab229b`](https://github.com/vertz-dev/vertz/commit/eab229bc63a08ae6877ff4905d99c364a8694358) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Validate entity models are registered in createDb() at server creation time. When an entity name doesn't match a key in the DatabaseClient's model registry, createServer() now throws a clear error listing all missing models and showing which models are registered. Previously this caused a cryptic runtime TypeError when the entity was first accessed.

- Updated dependencies [[`127df59`](https://github.com/vertz-dev/vertz/commit/127df59424102142ac1aee9dfcc31b22c2959343), [`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/db@0.2.13
  - @vertz/errors@0.2.13
  - @vertz/core@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.12
  - @vertz/db@0.2.12
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.11
  - @vertz/db@0.2.11
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.8
  - @vertz/db@0.2.8
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.7
  - @vertz/db@0.2.7
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.6
  - @vertz/db@0.2.6
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.5
  - @vertz/db@0.2.5
  - @vertz/errors@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/core@0.2.4
  - @vertz/db@0.2.4

## 0.2.3

### Patch Changes

- [#882](https://github.com/vertz-dev/vertz/pull/882) [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove deprecated module system (`createModule`, `createModuleDef`, services, routers) from public API. The entity + action pattern is now the only supported way to define routes. Internal infrastructure (Trie router, middleware runner, schema validation, CORS, error handling) is preserved.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b), [`b0b6115`](https://github.com/vertz-dev/vertz/commit/b0b6115e0389447ffb951e875b5ce224e4ace51c)]:
  - @vertz/core@0.2.3
  - @vertz/db@0.2.3

## 0.2.2

### Patch Changes

- [#861](https://github.com/vertz-dev/vertz/pull/861) [`b6cb0a0`](https://github.com/vertz-dev/vertz/commit/b6cb0a0e3de68974ce1747063288aef7a199f084) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix: address second-pass security audit findings — hidden field stripping in action pipeline, CSS value sanitization, empty string coercion guard

- Updated dependencies []:
  - @vertz/core@0.2.2
  - @vertz/db@0.2.2

## 0.2.0

### Minor Changes

- [#290](https://github.com/vertz-dev/vertz/pull/290) [`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380) Thanks [@vertz-dev-core](https://github.com/apps/vertz-dev-core)! - Rename `@vertz/core` → `@vertz/server` and `createApp()` → `createServer()`
  - Added `@vertz/server` package that re-exports all public API from `@vertz/core`
  - Added `createServer` as the preferred factory function (alias for `createApp`)
  - Added `vertz.server` namespace alias for `vertz.app`
  - Deprecated `createApp()` with console warning pointing to `createServer()`
  - Updated all internal imports to use `@vertz/server`
  - Compiler now recognizes both `vertz.app()` and `vertz.server()` calls

### Patch Changes

- Updated dependencies [[`a207936`](https://github.com/vertz-dev/vertz/commit/a2079362c54a8b61ea2368039abcb08681448380), [`b2d43d4`](https://github.com/vertz-dev/vertz/commit/b2d43d4f265e4b1a806b3e96f00721cc38cc07e8), [`c8efe6b`](https://github.com/vertz-dev/vertz/commit/c8efe6b4aef9ea9b9b4e3de414297ce2f829f7bb), [`3407afd`](https://github.com/vertz-dev/vertz/commit/3407afdf543481cd559e550454144d16e6a26e06), [`4f780bb`](https://github.com/vertz-dev/vertz/commit/4f780bba6bee7a493c9a1e0b8463ea2126a7285b), [`c1e38d0`](https://github.com/vertz-dev/vertz/commit/c1e38d010da1bea95ed9246968fabc22e300a6e9)]:
  - @vertz/core@0.2.0
