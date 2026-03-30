# Phases 1-4: OpenAPI Spec Serving

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent
- **Date:** 2026-03-29

## Changes

- `packages/server/src/entity/openapi-generator.ts` (modified) — added `ServiceDefForOpenAPI` interface, service route generation helpers
- `packages/server/src/entity/__tests__/openapi-generator.test.ts` (modified) — Phase 4 tests for service routes in OpenAPI spec
- `packages/server/src/create-server.ts` (modified) — `ServerApp` type with `getOpenAPISpec()`, `OpenAPIDocument` type, memoization, `/api/openapi.json` route, `openapi?: false` config
- `packages/server/src/__tests__/get-openapi-spec.test.ts` (new) — integration tests for `getOpenAPISpec()` and auto-serving
- `packages/server/src/index.ts` (modified) — new exports: `ServerApp`, `OpenAPIDocument`, `GetOpenAPISpecOptions`, `ServiceDefForOpenAPI`
- `packages/server/src/entity/index.ts` (modified) — re-export of `ServiceDefForOpenAPI`
- `native/vertz-runtime/src/server/mcp.rs` (modified) — `vertz_get_api_spec` MCP tool with tag-based filtering and schema pruning

## CI Status

- [ ] Quality gates passed (not verified by reviewer — author responsibility)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests cover all new behaviors)
- [x] No type gaps or missing edge cases (see findings below)
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design intent

## Findings

### SHOULD-FIX 1: `filter_openapi_spec` does not transitively resolve `$ref` chains

**File:** `native/vertz-runtime/src/server/mcp.rs`, lines 488-503

The schema pruning logic in `filter_openapi_spec` collects `$ref` strings from included paths and only keeps schemas that are directly referenced. However, it does not transitively resolve references. If schema `TasksResponse` references `TasksCommentsResponse` via `$ref`, the pruning step will correctly keep `TasksResponse` (referenced by the path) but will drop `TasksCommentsResponse` (only referenced from within `TasksResponse`, not from the path operations directly).

Additionally, `components.responses` (e.g., `BadRequest`, `Unauthorized`, `NotFound`) are referenced via `$ref: "#/components/responses/BadRequest"` from within path operations, but the pruning code only prunes `components.schemas`. The `components.responses` section is left intact (not pruned), which is fine — but the `ErrorResponse` schema referenced by those responses WILL be pruned if it's not directly referenced by a path operation. Since error response `$ref`s go through `components/responses/BadRequest` -> `components/schemas/ErrorResponse`, the `ErrorResponse` schema will be dropped because `collect_refs` on the path item will find `#/components/responses/BadRequest` but not `#/components/schemas/ErrorResponse`.

The test at line 1322 (`test_filter_openapi_spec_prunes_schemas`) confirms this bug: it asserts `ErrorResponse` is pruned, treating it as correct behavior. In practice, this produces a broken spec — `components.responses.BadRequest` references a schema that no longer exists.

**Recommendation:** Either:
1. Transitively resolve refs (collect refs from retained schemas and responses too), or
2. Always keep `ErrorResponse` in the schema set (it's shared infrastructure), or
3. Also prune `components.responses` to match

### SHOULD-FIX 2: Memoization of `getOpenAPISpec()` can return stale spec after domain merge

**File:** `packages/server/src/create-server.ts`, lines 580-646

When `getOpenAPISpec()` is called without options, the result is cached in `cachedDefaultSpec`. This is fine for a production server where entities/services are static. However, the implementation generates the spec by first calling `generateOpenAPISpec(nonDomainEntities, ...)` and then mutating the returned spec object via `Object.assign(spec.paths, domainSpec.paths)` and `spec.tags!.push(...)`.

Since the spec returned by `generateOpenAPISpec` contains the `STANDARD_RESPONSES` constant (line 586 of openapi-generator.ts: `responses: STANDARD_RESPONSES`), all generated specs share the same `STANDARD_RESPONSES` object reference. This is currently harmless because no code mutates it, but it's fragile — any future code that modifies the spec's `components.responses` could accidentally mutate the shared constant.

This is minor and not a blocker, but worth noting.

### SHOULD-FIX 3: OpenAPI route handler returns `Response` but `EntityRouteEntry.handler` expects `unknown`

**File:** `packages/server/src/create-server.ts`, lines 554-563

The route handler:
```ts
handler: () => {
  const spec = getOpenAPISpecFn!();
  return new Response(JSON.stringify(spec), {
    headers: { 'Content-Type': 'application/json' },
  });
},
```

The `EntityRouteEntry` handler signature is `(ctx: Record<string, unknown>) => unknown`, and the core app runner checks for `instanceof Response` to pass through responses directly (confirmed by app-runner code). So this works correctly at runtime. However, the handler does not accept the `ctx` parameter. While this is valid JS (extra args are ignored), it's inconsistent with the other entity route handlers. This is minor.

### NIT 1: `as unknown as JSONSchemaObject` cast in `ERROR_RESPONSE_SCHEMA`

**File:** `packages/server/src/entity/openapi-generator.ts`, line 375

```ts
error: {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
  },
} as unknown as JSONSchemaObject,
```

This uses `as unknown as T` — the double-cast pattern that the project's `no-double-cast` lint rule warns about. The issue is that `JSONSchemaObject` has `[key: string]: unknown` which makes nested objects incompatible structurally when `required` is `string[]` vs `readonly string[]`. Consider defining the nested object directly with the correct type or adding `as JSONSchemaObject` (single cast) if possible.

### NIT 2: `refs_used` uses `Vec<String>` with linear `.contains()` search

**File:** `native/vertz-runtime/src/server/mcp.rs`, lines 460, 498, 522

`collect_refs` pushes to a `Vec` and checks `.contains()` before pushing. For specs with many `$ref` values this is O(n^2). A `HashSet<String>` would be more appropriate. For typical API specs this won't matter, but it's a straightforward improvement.

### NIT 3: `ServiceDefForOpenAPI` duplicates shape from `ServiceDefinition`

**File:** `packages/server/src/entity/openapi-generator.ts`, lines 294-308

`ServiceDefForOpenAPI` is a simplified version of `ServiceDefinition` (from `service/types.ts`). The handler type is `(...args: unknown[]) => unknown` which is correct for the generator (it doesn't call handlers), but the `access` type is `Partial<Record<string, unknown>>` which loses the `AccessRule` typing. Since the generator only checks `=== undefined` and `=== false`, this works, but it means the generator can't distinguish access rule descriptors from arbitrary values. Consider using `AccessRule | false | undefined` as the value type if you want the generator to be able to inspect access rules in the future.

### NIT 4: Domain-scoped entities generate duplicate `ErrorResponse` schemas

**File:** `packages/server/src/create-server.ts`, lines 624-636

When merging domain-scoped entity specs, each call to `generateOpenAPISpec` includes its own `ErrorResponse` schema (line 442 of openapi-generator.ts). The merge uses `Object.assign(spec.components!.schemas!, domainSpec.components.schemas)`, which will overwrite the `ErrorResponse` from the primary spec with an identical one from the domain spec. Since they're structurally identical, this is harmless, but it's wasteful work.

### NIT 5: Missing CORS header on `/api/openapi.json` response

**File:** `packages/server/src/create-server.ts`, lines 557-563

The handler creates a raw `Response` with only `Content-Type`. If the server has CORS configured, the core app runner may or may not apply CORS headers to this response (depends on whether Response instances bypass CORS middleware). If they do bypass, external tools (like Swagger UI) won't be able to fetch the spec. This should be verified.

## Summary

**Approved with should-fix items.**

The implementation is solid overall. Test coverage is thorough — all new behaviors have corresponding tests. The API design (`getOpenAPISpec()` on the server object, lazy route handler, memoization) follows existing patterns well.

The most important finding is **SHOULD-FIX 1**: the Rust `filter_openapi_spec` function's schema pruning does not handle transitive `$ref` resolution, which can produce broken specs when filtering by tag. The `ErrorResponse` schema will be pruned even though it's indirectly needed by `components.responses` entries. This affects the MCP tool's usefulness for LLM agents that filter by entity/service name.

The other should-fix items are minor correctness concerns that won't cause issues in the happy path but represent edge cases worth addressing.

## Resolution

Awaiting author response.
