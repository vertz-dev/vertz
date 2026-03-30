# OpenAPI Spec Serving — Design Doc

> GitHub Issue: #2056
> Reference: `plans/vertz-dev-server/next-steps.md` §4.3

## Summary

Auto-generate and serve an OpenAPI 3.1 spec at runtime from registered entity and service definitions. Both the Bun dev server and the Rust runtime serve the spec at `/api/openapi.json`. The spec is available in both dev and production. It updates automatically when API routes change via HMR in dev mode. An MCP tool (`vertz_get_api_spec`) exposes the spec to LLMs.

---

## API Surface

### 1. `getOpenAPISpec()` — Runtime spec generation

```ts
import { createServer } from '@vertz/server';

const server = createServer({
  entities: [tasks, users],
  services: [analytics],
  db,
  auth: { /* ... */ },
});

// Returns the full OpenAPI 3.1 JSON object
const spec = server.getOpenAPISpec();
// => { openapi: '3.1.0', info: { ... }, paths: { ... }, components: { ... } }

// With custom options (reuses existing OpenAPISpecOptions type):
const spec2 = server.getOpenAPISpec({
  info: { title: 'My API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
});
```

`getOpenAPISpec()` is defined on a new `ServerApp` interface in `@vertz/server` that extends `AppBuilder`. It is **not** on `AppBuilder` in `@vertz/core` (that would create a circular dependency). The method is available on all return types of `createServer()` — both `ServerInstance` (when `db + auth` provided) and the plain `ServerApp` return.

The result is memoized: generated once on first call, cached for the lifetime of the server instance. No invalidation needed — entity/service definitions are immutable per instance. HMR creates a new server instance, which naturally gets a fresh spec.

**Default info:** When no options provided, uses `{ title: 'Vertz API', version: config.version ?? '0.1.0' }`. This uses the `version` field from `ServerConfig` if set.

### 2. Auto-serving at `/api/openapi.json`

```ts
// No config needed — auto-enabled when server has entities/services
// GET /api/openapi.json returns the spec
// Works in both dev and production
```

The endpoint is auto-registered when the server has `getOpenAPISpec()`. Developers who want to disable it can set `openapi: false` in server config:

```ts
createServer({
  openapi: false, // disables the /api/openapi.json endpoint
  // ...
});
```

**Path choice:** `/api/openapi.json` instead of `/__vertz_openapi` because:
- It's a well-known convention (Swagger UI, Postman, openapi-typescript auto-detect it)
- Consistent with the existing Bun dev server which already serves at `/api/openapi.json`
- The `/__vertz_` prefix is reserved for internal framework plumbing (HMR, diagnostics)

### 3. Dev server integration (Bun + Rust)

**Bun dev server:** Detects `getOpenAPISpec()` on the API handler object and registers the route. Uses lazy invalidation — on HMR, nulls the cached spec; regenerates on next request.

**Rust runtime:** After loading the server module in V8, extracts the spec by calling `instance.getOpenAPISpec()` directly (following the existing `extract_api_handler()` pattern — no `globalThis` injection needed). Caches the serialized JSON string in `DevServerState` behind `RwLock`. On isolate restart (HMR), re-extracts. The axum handler reads the cached string.

### 4. Domain-scoped entities

```ts
const hrDomain = domain('hr', {
  entities: [employees, departments],
  services: [],
});

const server = createServer({
  domains: [hrDomain],
  // ...
});

const spec = server.getOpenAPISpec();
// Paths include domain prefix:
// /api/hr/employees
// /api/hr/employees/{id}
// /api/hr/departments
// /api/hr/departments/{id}
```

The `getOpenAPISpec()` implementation inside `createServer()` passes the correct `apiPrefix` per domain group when calling the generator. Domain-scoped entities get `${apiPrefix}/${domainName}` as their prefix. Non-domain entities get the standard `apiPrefix`.

### 5. MCP tool: `vertz_get_api_spec`

```json
{
  "name": "vertz_get_api_spec",
  "description": "Returns the app's OpenAPI 3.1 specification including all entity CRUD routes, service endpoints, schemas, and access rules",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": {
        "type": "string",
        "description": "Filter by entity or service name (e.g., 'tasks', 'analytics'). Returns only paths tagged with the matching name. Comma-separated for multiple (e.g., 'tasks,users'). Component schemas are pruned to only those referenced by included paths."
      }
    }
  }
}
```

**Filter semantics:** Exact match on OpenAPI tag name. Comma-separated for multiple tags. When filter matches nothing, returns `{ paths: {} }` with 200 (not an error). Component schemas are pruned to only those `$ref`-referenced by included paths.

The MCP tool is available on both the Bun dev server and the Rust runtime.

### 6. Service OpenAPI generation

```ts
const analytics = service('analytics', {
  inject: { tasks },
  access: {
    summary: rules.authenticated(),
  },
  actions: {
    summary: action({
      method: 'GET',
      body: s.object({ from: s.string(), to: s.string() }),
      response: s.object({ count: s.number(), average: s.number() }),
      handler: async (input, ctx) => { /* ... */ },
    }),
  },
});

// The OpenAPI spec includes:
// GET /api/analytics/summary
//   requestBody: { from: string, to: string }
//   response: { count: number, average: number }
```

Service schemas are extracted via `toJSONSchema()` on the `body` and `response` schema objects, using the same `extractJsonSchema()` duck-type check as entity custom actions.

**Custom paths:** When a service action has `path: '/custom-path'`, the spec uses that absolute path directly (mirroring the route generator's behavior where custom paths bypass the prefix).

### 7. Security schemes

The generated spec includes a `securitySchemes` section when auth is configured:

```json
{
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    }
  },
  "security": [{ "bearerAuth": [] }]
}
```

This tells consumers how to authenticate without documenting auth endpoints themselves.

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"
The OpenAPI spec is generated from the same type-safe entity/service definitions that drive the runtime. No manual spec authoring — the spec is always in sync because it's derived from the same source of truth.

### Principle 3: "AI agents are first-class users"
The MCP tool exposes the spec to LLMs in both dev and production. An LLM consuming a deployed Vertz API can discover the full API surface at `/api/openapi.json`.

### Principle 6: "If you can't demo it, it's not done"
Developer starts the server, navigates to `/api/openapi.json`, sees a complete spec. Paste into Swagger UI or feed to an LLM. Zero config.

### Tradeoff: Convention over configuration
Auto-generate default info from `config.version`. Developers override via `getOpenAPISpec({ info })`. The convention (auto-enabled, well-known path) serves 90% of cases.

### Rejected alternative: Static spec file generation
The existing `openapi: { specPath }` option requires external tooling and risks stale specs. Runtime generation eliminates both.

---

## Non-Goals

1. **Swagger UI hosting** — We serve raw JSON, not a UI. Developers use any OpenAPI viewer.

2. **Client SDK generation** — The spec enables it, but we don't build the generator.

3. **OpenAPI validation/linting** — We generate a valid spec, but don't lint for quality.

4. **GraphQL schema generation** — Out of scope. OpenAPI covers REST routes only.

5. **Auth endpoint documentation** — Auth routes (`/api/auth/*`) are not included in the spec. They follow well-known patterns. The `securitySchemes` section tells consumers how to authenticate.

---

## Unknowns

1. **Service schema extraction reliability** — Service schemas use `SchemaLike` which may or may not have `toJSONSchema()`. The existing `extractJsonSchema()` handles this with a warning fallback.
   - **Resolution:** Use the same duck-type check as entity custom actions. Well-tested.

2. **Default info values** — Use `{ title: 'Vertz API', version: config.version ?? '0.1.0' }`. No package.json reading needed.

---

## POC Results

No POC needed. The existing `generateOpenAPISpec()` in `packages/server/src/entity/openapi-generator.ts` is well-tested (40+ test cases). The remaining work is wiring, not R&D.

---

## Type Flow Map

```
EntityDefinition[] ──┐
                     ├──→ generateOpenAPISpec() ──→ OpenAPISpec (JSON)
ServiceDefinition[] ─┘                                    │
                                                    getOpenAPISpec()  (memoized)
                                                           │
                                         ┌────────────────┼────────────────┐
                                         ▼                 ▼                ▼
                                  Bun dev server    Rust runtime      MCP tool
                                /api/openapi.json  /api/openapi.json  vertz_get_api_spec
```

### Generics

- `EntityDefinition<TModel>` — `TModel` erased at the OpenAPI boundary. Generator reads `_meta` from column builders.
- `ServiceActionDef<TInput, TOutput>` — Erased. Generator uses `body.toJSONSchema()` and `response.toJSONSchema()`.
- No generic flows to consumer — the spec is plain JSON.

### Type test

```ts
// .test-d.ts — getOpenAPISpec is NOT on AppBuilder from @vertz/core
import type { AppBuilder } from '@vertz/core';
const app = {} as AppBuilder;
// @ts-expect-error — getOpenAPISpec only exists on @vertz/server return types
app.getOpenAPISpec();
```

---

## E2E Acceptance Test

### Developer walkthrough: Entity + Service spec

```ts
import { expect, describe, it } from 'bun:test';
import { createServer, entity, service, action } from '@vertz/server';
import { model, d } from '@vertz/db';
import { s } from '@vertz/schema';
import { rules } from '@vertz/auth/rules';

const taskModel = model('tasks', {
  id: d.uuid().primaryKey().defaultRandom(),
  title: d.text().notNull(),
  status: d.text().notNull(),
  createdAt: d.timestamp().notNull().defaultNow(),
});

const tasks = entity('tasks', {
  model: taskModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.authenticated(),
  },
});

const analytics = service('analytics', {
  access: { summary: rules.authenticated() },
  actions: {
    summary: action({
      method: 'GET',
      response: s.object({ count: s.number() }),
      handler: async () => ({ count: 42 }),
    }),
  },
});

describe('Feature: OpenAPI spec serving', () => {
  describe('Given a server with entities and services', () => {
    const server = createServer({
      entities: [tasks],
      services: [analytics],
    });

    describe('When getOpenAPISpec() is called', () => {
      it('Then returns a valid OpenAPI 3.1 document', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
      });

      it('Then includes entity CRUD paths', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.paths['/api/tasks']).toBeDefined();
        expect(spec.paths['/api/tasks'].get).toBeDefined();
        expect(spec.paths['/api/tasks'].post).toBeDefined();
        expect(spec.paths['/api/tasks/{id}']).toBeDefined();
        expect(spec.paths['/api/tasks/{id}'].get).toBeDefined();
        expect(spec.paths['/api/tasks/{id}'].patch).toBeDefined();
      });

      it('Then includes service action paths', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.paths['/api/analytics/summary']).toBeDefined();
        expect(spec.paths['/api/analytics/summary'].get).toBeDefined();
      });

      it('Then includes component schemas', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.components.schemas.TasksResponse).toBeDefined();
        expect(spec.components.schemas.TasksCreateInput).toBeDefined();
      });

      it('Then includes securitySchemes when auth is configured', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.components.securitySchemes).toBeDefined();
      });
    });

    describe('When getOpenAPISpec is called with custom info', () => {
      it('Then uses the provided info', () => {
        const spec = server.getOpenAPISpec({
          info: { title: 'My API', version: '2.0.0' },
        });
        expect(spec.info.title).toBe('My API');
        expect(spec.info.version).toBe('2.0.0');
      });
    });
  });
});
```

### Developer walkthrough: Dev server endpoint

```ts
describe('Feature: /api/openapi.json endpoint', () => {
  describe('Given a running dev server with entities', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 200 with application/json content-type', async () => {
        const response = await fetch(`http://localhost:${port}/api/openapi.json`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');
      });

      it('Then returns a valid OpenAPI 3.1 JSON document', async () => {
        const response = await fetch(`http://localhost:${port}/api/openapi.json`);
        const spec = await response.json();
        expect(spec.openapi).toBe('3.1.0');
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
      });
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Service OpenAPI generation (TS foundation)

Extend `generateOpenAPISpec()` to accept service definitions alongside entities. Add service path generation using the same `extractJsonSchema()` duck-type check for body/response schemas.

**Key details:**
- Service paths follow the route generator logic: `{prefix}/{serviceName}/{actionName}` unless custom `path` is set (custom path is used as-is, no prefix)
- Service actions without access rules are excluded (deny by default)
- Service actions with `access: false` get 405 in the spec (reuse `buildDisabledOperation()`)
- Services get their own tag (service name)

**Acceptance criteria:**
```ts
describe('Feature: Service routes in OpenAPI spec', () => {
  describe('Given a service with body and response schemas', () => {
    describe('When generateOpenAPISpec is called with services', () => {
      it('Then includes service action paths with correct methods', () => {});
      it('Then includes request body schema from service body', () => {});
      it('Then includes response schema from service response', () => {});
      it('Then service actions without access rules are excluded', () => {});
      it('Then service actions with access: false get 405 in spec', () => {});
    });
  });
  describe('Given a service with custom path', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then uses the custom path as-is in the spec', () => {});
    });
  });
  describe('Given both entities and services', () => {
    describe('When generateOpenAPISpec is called', () => {
      it('Then merges entity and service paths into one spec', () => {});
      it('Then entity and service tags are separate', () => {});
    });
  });
});
```

### Phase 2: `getOpenAPISpec()` on server return types

Define `ServerApp extends AppBuilder` in `@vertz/server` with `getOpenAPISpec(options?)`. Attach in `createServer()` body where entity/service definitions are in scope. Memoize the result (no invalidation needed — definitions are immutable per instance).

**Key details:**
- Domain-scoped entities: call `generateOpenAPISpec()` per domain group with the correct prefix, merge resulting specs
- `ServerInstance extends ServerApp` (adds auth), so `getOpenAPISpec()` is available on both
- Reuse existing exported `OpenAPISpecOptions` type (minus `apiPrefix` which is derived from config)
- Add `securitySchemes` when auth config is present
- Default info: `{ title: 'Vertz API', version: config.version ?? '0.1.0' }`
- Add `openapi?: false` config option to disable auto-serving

**Acceptance criteria:**
```ts
describe('Feature: server.getOpenAPISpec()', () => {
  describe('Given a server with entities and services', () => {
    describe('When getOpenAPISpec() is called', () => {
      it('Then returns a complete OpenAPI 3.1 spec', () => {});
      it('Then includes both entity and service routes', () => {});
      it('Then uses default info when no options provided', () => {});
      it('Then memoizes the result (same object on repeat calls)', () => {});
    });
    describe('When getOpenAPISpec({ info }) is called', () => {
      it('Then uses the provided info', () => {});
    });
  });
  describe('Given a server with domain-scoped entities', () => {
    describe('When getOpenAPISpec() is called', () => {
      it('Then domain prefix is reflected in paths (e.g., /api/hr/employees)', () => {});
      it('Then non-domain entities use the standard prefix', () => {});
    });
  });
  describe('Given a server with auth configured', () => {
    describe('When getOpenAPISpec() is called', () => {
      it('Then includes securitySchemes with bearerAuth', () => {});
      it('Then includes global security requirement', () => {});
    });
  });
});
```

### Phase 3: Bun dev server auto-serving

Wire `/api/openapi.json` into `createBunDevServer`. When the API handler has `getOpenAPISpec()`, auto-register the endpoint. Use lazy invalidation — on HMR, null the cached spec; regenerate on next request.

**Key details:**
- Replace/extend the existing `openapi: { specPath }` option — the new auto-generated endpoint supersedes file-based serving when entity-based
- Backward compatible: `openapi: { specPath }` still works for apps that generate specs externally
- Lazy regeneration: HMR sets dirty flag, next request regenerates

**Acceptance criteria:**
```ts
describe('Feature: /api/openapi.json in Bun dev server', () => {
  describe('Given a dev server with apiHandler that has getOpenAPISpec', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 200 with the OpenAPI spec as JSON', () => {});
      it('Then Content-Type is application/json', () => {});
    });
    describe('When a server module changes (HMR)', () => {
      it('Then the cached spec is invalidated', () => {});
      it('Then the next request returns the updated spec', () => {});
    });
  });
  describe('Given a dev server without apiHandler', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 404', () => {});
    });
  });
  describe('Given openapi: false in server config', () => {
    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 404', () => {});
    });
  });
});
```

### Phase 4a: Rust runtime serving

On the Rust side: after loading the server module in V8, extract the spec by calling `instance.getOpenAPISpec()` (same pattern as `extract_api_handler()`). Cache the serialized JSON string in `DevServerState` behind `RwLock`. Mount `GET /api/openapi.json` in the axum router. On isolate restart (HMR), re-extract.

**Acceptance criteria:**
```
Feature: /api/openapi.json in Rust runtime
  Given the Rust dev server with a loaded server module
    When GET /api/openapi.json is requested
      Then returns 200 with valid OpenAPI 3.1 JSON
    When server module is reloaded via HMR
      Then the spec reflects the updated routes
    When openapi is disabled in config
      Then returns 404
```

### Phase 4b: MCP tool (`vertz_get_api_spec`)

Add `vertz_get_api_spec` MCP tool to both the Rust MCP server and the Bun dev server's MCP integration. The tool returns the cached spec (or calls `getOpenAPISpec()` if not cached). Supports the `filter` parameter for tag-based filtering with schema pruning.

**Acceptance criteria:**
```
Feature: vertz_get_api_spec MCP tool
  Given the MCP server is running
    When vertz_get_api_spec is called without filter
      Then returns the full OpenAPI spec as JSON text content
    When vertz_get_api_spec is called with filter "tasks"
      Then returns only paths tagged with "tasks"
      Then component schemas are pruned to only those referenced by included paths
    When vertz_get_api_spec is called with filter "nonexistent"
      Then returns { paths: {} } with 200 (not an error)
    When vertz_get_api_spec is called with filter "tasks,users"
      Then returns paths tagged with either "tasks" or "users"
```

### Phase dependencies

```
Phase 1 (service OpenAPI) → Phase 2 (getOpenAPISpec method)
Phase 2 → Phase 3 (Bun dev server)
Phase 2 → Phase 4a (Rust runtime)
Phase 2 → Phase 4b (MCP tool)
Phase 3, 4a, 4b are independent of each other
```

---

## Known Limitations

- **Large specs:** For apps with 50+ entities, the spec JSON may be large (hundreds of KB). The MCP tool's `filter` parameter mitigates this for LLM consumers. HTTP compression (gzip) is available through standard server middleware. A summary-only mode (paths + methods, no schemas) may be added later if needed.

- **Cache granularity:** The spec is regenerated entirely when any entity/service changes. Partial invalidation is not planned — full regeneration from metadata is fast enough for the expected scale.

---

## Key Files

| Component | Path |
|---|---|
| Entity OpenAPI generator | `packages/server/src/entity/openapi-generator.ts` |
| Entity OpenAPI tests | `packages/server/src/entity/__tests__/openapi-generator.test.ts` |
| Server creation | `packages/server/src/create-server.ts` |
| Service types | `packages/server/src/service/types.ts` |
| Service route generator | `packages/server/src/service/route-generator.ts` |
| Core app types | `packages/core/src/types/app.ts` |
| Bun dev server | `packages/ui-server/src/bun-dev-server.ts` |
| Rust HTTP server | `native/vertz-runtime/src/server/http.rs` |
| Rust MCP server | `native/vertz-runtime/src/server/mcp.rs` |
| @vertz/server exports | `packages/server/src/index.ts` |

---

## Review Log

### DX Review (2026-03-29) — APPROVED with should-fix items
Findings addressed:
- **Path changed** to `/api/openapi.json` (well-known convention)
- **Default info** uses `config.version`, title "Vertz API"
- **Production serving** enabled by default with opt-out
- **Options type** reuses existing `OpenAPISpecOptions`
- **MCP filter description** improved with exact semantics
- **Type test** converted to real `.test-d.ts` assertion

### Product/Scope Review (2026-03-29) — CHANGES REQUESTED → Addressed
Findings addressed:
- **Phase 4 split** into 4a (Rust endpoint) + 4b (MCP tool)
- **Production serving** as default, with `openapi: false` opt-out
- **Domain-scoped paths** documented with examples
- **MCP tool placement** clarified: available on both Bun and Rust
- **Filter semantics** fully specified (exact tag match, comma-separated, schema pruning)
- **Large spec scaling** acknowledged in Known Limitations
- **securitySchemes** added to generated spec

### Technical Review (2026-03-29) — CHANGES REQUESTED → Addressed
Findings addressed:
- **`getOpenAPISpec()` on `ServerApp`** (new @vertz/server type), NOT on `AppBuilder` in @vertz/core
- **Domain-scoped paths** handled by calling generator per-domain group with correct prefix
- **Service custom paths** mirror route generator behavior (absolute when custom)
- **Caching simplified** to memoize-once (no invalidation — immutable per instance)
- **Rust extraction** follows existing handler pattern, no globalThis injection
- **Lazy invalidation** in dev servers (dirty flag, regenerate on request)
