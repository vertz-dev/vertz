# Plan: Standalone `action()` + Module/Router Cleanup

## Context

The entity-first architecture decision (`plans/decisions/2026-02-20-entity-first-architecture.md`) deprecated modules/routers in favor of entities. But there's a gap: non-entity endpoints (webhooks, OAuth callbacks, health checks) have no clean replacement. The EDA design (`plans/entity-driven-architecture.md` §3.9) specifies `action()` as the solution. Issue #819 (GitHub OAuth endpoints for the cloud platform) is a concrete consumer of this.

Currently the public API exports both `entity()` and `createModule()/createModuleDef()/createRouterDef()` — creating a "two ways to do things" problem that violates the manifesto.

**Goal:** Implement `action()` with entity DI, then remove modules/routers from the public API.

**Worktree:** `/Users/viniciusdacal/vertz-dev/vertz/.claude/worktrees/action-cleanup` (branch: `feat/action-standalone-cleanup`)

**GitHub Issue:** Create a new issue before starting implementation. Title: `feat: standalone action() + module/router removal`. The issue covers both the `action()` implementation and the module/router public API cleanup.

---

## Phase 1: `action()` Types, Factory, and Walkthrough Test (RED)

### 1a. Walkthrough test (RED — fails at import)

Create `packages/integration-tests/src/__tests__/action-walkthrough.test.ts` using only public imports from `@vertz/server`. This test defines an entity, an action that injects it, wires both into `createServer()`, and asserts HTTP responses. It will fail to compile until Phase 2.

### 1b. Shared base context type

Extract a `BaseContext` interface from `EntityContext` so both `EntityContext` and `ActionContext` extend it. This fixes the `enforceAccess()` type compatibility — the enforcer accepts `BaseContext` instead of `EntityContext`.

Modify `packages/server/src/entity/types.ts`:
```typescript
// Shared base — used by enforceAccess(), entity context, and action context
interface BaseContext {
  readonly userId: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}

interface EntityContext<TModel, TInject> extends BaseContext {
  readonly entity: EntityOperations<TModel>;
  readonly entities: InjectToOperations<TInject>;
}
```

Modify `packages/server/src/entity/access-enforcer.ts`:
- Change `enforceAccess()` to accept `BaseContext` instead of `EntityContext`

### 1c. Action types

Create `packages/server/src/action/types.ts`:

```typescript
interface ActionContext<TInject> extends BaseContext {
  readonly entities: InjectToOperations<TInject>;
  // NO `entity` — actions have no model/self-CRUD
}

interface ActionActionDef<TInput, TOutput, TCtx> {
  readonly method?: string;    // default: 'POST'
  readonly path?: string;      // custom path override
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (input: TInput, ctx: TCtx) => Promise<TOutput>;
  // NO `row` param — actions are always collection-level
}

interface ActionConfig<TActions, TInject> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<keyof TActions, AccessRule>>;
  readonly actions: { readonly [K in keyof TActions]: TActions[K] };
}

interface ActionDefinition {
  readonly kind: 'action';     // discriminator
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly actions: Record<string, ActionActionDef>;
}
```

Add `kind: 'entity'` to `EntityDefinition` in `packages/server/src/entity/types.ts`.
Also update the **forward-declared** `EntityDefinition` in `packages/core/src/types/app.ts` to include `readonly kind?: string` (optional for backward compat at the core boundary).

### 1d. Factory function

Create `packages/server/src/action/action.ts`:
- Same validation as `entity()`: name format `/^[a-z][a-z0-9-]*$/`, deep-freeze result
- Must have at least one action in `actions`

### 1e. Type flow tests

Create `packages/server/src/action/__tests__/action.test-d.ts`:
- `ctx.entities.users.get(id)` compiles when `inject: { users: usersEntity }`
- `@ts-expect-error` on `ctx.entities.nonexistent`
- `@ts-expect-error` on `ctx.entity` (no self-CRUD on ActionContext)

### Acceptance criteria
- `action('auth', { actions: { login: { body, response, handler } } })` returns frozen `ActionDefinition` with `kind: 'action'`
- Name validation rejects `'Invalid'`, accepts `'auth'`
- `enforceAccess()` accepts both `EntityContext` and `ActionContext` (via `BaseContext`)
- Type flow tests pass typecheck
- Walkthrough test exists but fails (RED)

### Key files
- Create: `packages/server/src/action/types.ts`, `action.ts`, `index.ts`, `__tests__/action.test.ts`, `__tests__/action.test-d.ts`
- Modify: `packages/server/src/entity/types.ts` (extract `BaseContext`, add `kind: 'entity'`), `packages/server/src/entity/entity.ts` (emit `kind`), `packages/server/src/entity/access-enforcer.ts` (accept `BaseContext`), `packages/core/src/types/app.ts` (add `kind?` to forward-declared `EntityDefinition`)
- Create: `packages/integration-tests/src/__tests__/action-walkthrough.test.ts` (RED)

---

## Phase 2: Action Route Generation + Server Integration

### 2a. ActionContext factory

Create `packages/server/src/action/context.ts` — mirrors `createEntityContext()` but without `entity` prop. Uses `EntityRegistry.createScopedProxy()` for DI (same mechanism as entities).

### 2b. Route generator

Create `packages/server/src/action/route-generator.ts`:

```typescript
function generateActionRoutes(
  def: ActionDefinition,
  registry: EntityRegistry,
  options?: { apiPrefix?: string },
): EntityRouteEntry[]
```

- Default route: `POST /{apiPrefix}/{actionName}/{handlerName}` (e.g. `POST /api/auth/login`)
- Custom method/path per action handler
- Reuses `enforceAccess()` from entity access-enforcer (now accepts `BaseContext`)
- Same deny-by-default: no access rule → no route generated
- Body validation via `schema.parse()`
- Response validation via `response.parse()` (same as entity actions)

### 2c. Route collision detection

Add validation in `createServer()`: when both entities and actions are provided, check that no action route path collides with an entity route path. Specifically:
- An action named `auth` would produce `/api/auth/login` — this could collide with an entity named `auth` producing `/api/auth/:id`. The `:id` param would match `login` as an ID.
- **Resolution:** Action routes take a different path format: handler name is NOT a `:id` match. Since Trie routing uses exact-before-param matching, `/api/auth/login` (exact) takes priority over `/api/auth/:id` (param). Verify this with a test.
- Log a warning if an action name matches an entity name (ambiguity risk).

### 2d. Wire into createServer()

Modify `packages/server/src/create-server.ts`:

```typescript
interface ServerConfig {
  entities?: EntityDefinition[];
  actions?: ActionDefinition[];   // NEW
  db?: DatabaseClient | EntityDbAdapter;
}
```

- Actions processed AFTER entities (so registry has all entities registered for DI)
- Action routes appended to the same `entityRoutes` array → passed as `_entityRoutes` to core
- Entities already use `EntityRegistry` for DI; actions use the same registry via `createScopedProxy()`

### 2e. Export from @vertz/server

Add to `packages/server/src/index.ts`: `action`, `ActionDefinition`, `ActionContext`, `ActionConfig`, `ActionActionDef`, `BaseContext`.

### 2f. Walkthrough test goes GREEN

The walkthrough test from Phase 1 should now compile and pass.

### Acceptance criteria
- `POST /api/auth/login` returns 200 with expected body
- `POST /api/auth/noAccess` returns 403 (no access rule → not generated, so 404)
- Action handler receives `ctx.entities.users` that can call `.get()`, `.list()`, etc.
- Invalid body returns 400 with schema error
- Entity + action with same name: exact path wins over `:id` param (test with Trie)

### Key files
- Create: `packages/server/src/action/context.ts`, `route-generator.ts`, `__tests__/route-generator.test.ts`
- Modify: `packages/server/src/create-server.ts`, `packages/server/src/index.ts`

---

## Phase 3: Migrate Consumers OFF Modules (before removal)

**Rationale:** Update all consumers to use entities/actions FIRST, while modules still exist. This keeps the codebase green after each sub-phase. Only after all consumers are migrated do we delete the module code (Phase 4).

### 3a. Integration tests

**Modify/rewrite:**
- `packages/integration-tests/src/app/create-app.ts` → rewrite to use `entity()` + `action()` + `createServer()`
- `packages/integration-tests/src/__tests__/multi-module.test.ts` → rewrite as `cross-entity.test.ts`
- `packages/integration-tests/src/__tests__/e2e-listen.test.ts` → rewrite to not import module factories
- `packages/integration-tests/src/__tests__/dts-type-preservation.test.ts` → update assertions (remove module type assertions, add action type assertions)

**Delete:**
- `packages/integration-tests/src/app/modules/` (users.ts, todos.ts) — after rewrite above

### 3b. Core app tests

Rewrite `packages/core/src/app/__tests__/` tests to use `_entityRoutes` config directly instead of modules:
- `app-builder.test.ts` — replace module registration tests with entity route tests; update inline `EntityDefinition` objects to include `kind: 'entity'`
- `app-runner.test.ts` — replace module route tests with `_entityRoutes`
- `route-log.test.ts` — update route collection tests
- `schema-validation.test.ts`, `listen.test.ts`, `response-validation.test.ts`, `route-middleware.test.ts`, `app-runner-errors.test.ts` — update test setups

### 3c. Examples

- Delete `examples/task-api/` (contacts-api and entity-todo cover the same ground)
- Rewrite `examples/ssr-cloudflare/src/app.ts` — convert from `vertz.moduleDef()` + `.register()` to entity/action pattern
- Delete `packages/core/examples/basic-api/` (uses modules; entity-todo is better)
- Delete `packages/compiler/examples/analyze-app/sample-app/users.module.ts` — replace with entity-based sample

### 3d. Testing package (~900 lines of test rewrites)

This is the largest consumer. The `test-app.ts` has a ~250-line parallel implementation of module-based request handling.

**Rewrite `packages/testing/src/test-app.ts`:**
- Remove `.register(module)` from `TestApp` interface
- New API wraps `createServer()` from `@vertz/server` directly
- Accept `entities` and `actions` in config
- Remove `resolveServices()`, module router iteration, service injection
- Keep `.mockMiddleware()` (still relevant)
- Provide mock DB adapter support

```typescript
function createTestApp(config: {
  entities?: EntityDefinition[];
  actions?: ActionDefinition[];
  db?: EntityDbAdapter;
  middlewares?: NamedMiddlewareDef[];
}): TestApp;
```

**Rewrite tests:**
- `test-app.test.ts` (~522 lines) → rewrite with entity/action patterns
- `test-app.test-d.ts` (~152 lines) → update type assertions
- `test-service.test.ts` (~242 lines) → delete (services are module-coupled)

**Delete:** `packages/testing/src/test-service.ts`

### 3e. CLI and scaffolding

- Delete `packages/cli/src/generators/module.ts` (and `__tests__/module.test.ts`)
- Rewrite `packages/create-vertz-app/src/templates/index.ts` — 7+ template functions need updating:
  - `healthModuleDefTemplate()` → `healthActionTemplate()` using `action('health', { ... })`
  - `healthModuleTemplate()` → delete
  - `healthServiceTemplate()` → delete
  - `healthRouterTemplate()` → delete
  - `appTemplate()` → use `createServer({ entities: [...], actions: [healthAction] })`
- Update corresponding template tests

### 3f. Server re-exports test

Modify `packages/server/src/__tests__/re-exports.test.ts` — remove assertions that `createModule`, `createModuleDef` are re-exported. Add assertions for `action`, `ActionDefinition`.

### Acceptance criteria
- All tests pass with modules still in the codebase (nothing deleted yet)
- No file outside `packages/core/src/module/` imports from `packages/core/src/module/`
- `bun test && bun run typecheck` green

---

## Phase 4: Delete Module/Router Code

**Rationale:** Now that all consumers are migrated, the module code has zero imports outside its own directory. Safe to delete.

### 4a. Remove from @vertz/core

**Delete:**
- `packages/core/src/module/` (entire directory: `module-def.ts`, `module.ts`, `router-def.ts`, `service.ts`, `index.ts`, `__tests__/` with 7 test files)
- `packages/core/src/types/module.ts`
- `packages/core/src/types/boot-sequence.ts`

**Modify:**
- `packages/core/src/index.ts` — remove all module/router/service exports:
  - Functions: `createModule`, `createModuleDef`
  - Types: `NamedModule`, `NamedModuleDef`, `NamedRouterDef`, `NamedServiceDef`, `ExtractMethods`, `ResolveInjectMap`, `Module`, `ModuleDef`, `RouterDef`, `ServiceDef`, `BootInstruction`, `BootSequence`, `ModuleBootInstruction`, `ServiceBootInstruction`, `ServiceFactory`
- `packages/core/src/types/index.ts` — remove Module, ModuleDef, RouterDef, ServiceDef re-exports
- `packages/core/src/vertz.ts` — remove `moduleDef()` and `module()` from `vertz` namespace
- `packages/core/src/app/app-builder.ts` — remove `.register()` method, `ModuleRegistration` import, module route collection logic
- `packages/core/src/app/app-runner.ts` — remove `resolveServices()`, `resolveRouterServices()`, `registerRoutes()`, `ModuleRegistration` type; simplify `buildHandler()` to only register entity/action routes via `_entityRoutes`
- `packages/core/src/app/route-log.ts` — remove `collectRoutes()` (depends on modules); route log now uses entity/action routes tracked in app-builder

### 4b. Remove from @vertz/server

**Modify:**
- `packages/server/src/index.ts` — remove all module re-exports (`createModule`, `createModuleDef`, `NamedModule`, `NamedModuleDef`, `NamedRouterDef`, `NamedServiceDef`, `ExtractMethods`, `ResolveInjectMap`, `vertz` namespace if it only contained module refs)

### 4c. Compiler package — keep ModuleIR as internal IR

The `@vertz/compiler` package has deep module coupling: `ModuleAnalyzer`, `ModuleValidator`, `CompletenessValidator`, `BootGenerator`, `entity-route-injector` (creates synthetic `__entities` module), IR types (`ModuleIR`, `RouterIR`, `ServiceIR`). The entity-route-injector already creates synthetic modules — `ModuleIR` is the compiler's internal organization unit for routes.

**Decision:** Keep `ModuleIR` as an internal compiler concept. The compiler continues to organize routes internally as "modules" even though the public API no longer exposes module creation. The `entity-route-injector` already creates a synthetic `__entities` module — we extend this to create a synthetic `__actions` module for action routes.

**Modify (minimal):**
- `packages/compiler/src/analyzers/module-analyzer.ts` — the analyzer will find zero `vertz.moduleDef()` calls in user code (since they no longer exist). This is fine — it produces empty results. No change needed.
- `packages/compiler/src/ir/entity-route-injector.ts` — add action route injection alongside entity routes (creates synthetic `__actions` module in IR)
- Remove `ModuleAnalyzer`, `ModuleValidator` from `@vertz/compiler` **public exports** (keep as internal). They still exist for the synthetic module path.

### 4d. Changeset

Create `.changeset/` entry with `patch` for `@vertz/core`, `@vertz/server`, `@vertz/testing`, `@vertz/cli`, `@vertz/compiler`, and any other affected published packages.

### Acceptance criteria
- `bun test` — all tests pass
- `bun run typecheck` — no type errors (including `--filter @vertz/integration-tests`)
- `bunx biome check` — lint clean
- `@vertz/core` exports do NOT include any module/router/service symbols
- `@vertz/server` exports do NOT include any module/router/service symbols
- `examples/entity-todo` still builds and runs
- `examples/ssr-cloudflare` still builds and runs (now entity/action based)

---

## Verification

After each phase:
1. `bun test` — all tests pass
2. `bun run typecheck` — no type errors (including `--filter @vertz/integration-tests`)
3. `bunx biome check --write` — lint/format clean

End-to-end validation:
- The walkthrough test exercises: `action()` definition → entity DI → `createServer()` → HTTP request → response
- `@vertz/core` and `@vertz/server` no longer export module/router APIs (typecheck verifies — any lingering imports fail)
- `examples/entity-todo` and `examples/ssr-cloudflare` still build and run
- The compiler pipeline still works (entity-route-injector creates synthetic modules)

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| `enforceAccess()` type mismatch | Extract `BaseContext` shared between EntityContext and ActionContext (Phase 1b) |
| Route collision entity `:id` vs action handler name | Trie exact-before-param matching; add warning log if names overlap (Phase 2c) |
| Core forward-declared `EntityDefinition` missing `kind` | Add `kind?: string` to core's forward declaration (Phase 1c) |
| App tests deeply coupled to modules | Rewrite to `_entityRoutes` config BEFORE deleting modules (Phase 3b) |
| Testing package ~900 lines of test rewrites | New `createTestApp` wraps `createServer()` — net simplification but significant effort (Phase 3d) |
| Compiler deeply coupled to modules | Keep `ModuleIR` as internal IR; synthetic modules for entity/action routes (Phase 4c) |
| `create-vertz-app` templates generate module code | Rewrite 7+ templates in Phase 3e |
| `examples/ssr-cloudflare` uses modules | Rewrite in Phase 3c |
| `e2e-listen.test.ts` imports module factories | Rewrite in Phase 3a |
| `re-exports.test.ts` asserts module exports | Update in Phase 3f |
| `kind: 'entity'` breaks test mocks creating EntityDefinition | Update mocks in Phase 3b (app tests) — small blast radius |

---

## Files Summary

### Created (~15 files)
- `packages/server/src/action/` — types.ts, action.ts, context.ts, route-generator.ts, index.ts
- `packages/server/src/action/__tests__/` — action.test.ts, action.test-d.ts, route-generator.test.ts
- `packages/integration-tests/src/__tests__/action-walkthrough.test.ts`
- `packages/integration-tests/src/__tests__/cross-entity.test.ts`
- `.changeset/*.md`

### Deleted (~25 files)
- `packages/core/src/module/` — 5 implementation files + 7 test files
- `packages/core/src/types/module.ts`, `boot-sequence.ts`
- `packages/core/examples/basic-api/`
- `packages/integration-tests/src/app/modules/` (users.ts, todos.ts)
- `packages/testing/src/test-service.ts`, `__tests__/test-service.test.ts`
- `packages/cli/src/generators/module.ts` + tests
- `examples/task-api/` (entire example)
- `packages/compiler/examples/analyze-app/sample-app/users.module.ts`

### Modified (~30 files)
- `packages/server/src/entity/types.ts` (BaseContext, kind)
- `packages/server/src/entity/entity.ts` (emit kind)
- `packages/server/src/entity/access-enforcer.ts` (accept BaseContext)
- `packages/server/src/create-server.ts` (actions config)
- `packages/server/src/index.ts` (add action exports, remove module re-exports)
- `packages/core/src/types/app.ts` (forward-declared EntityDefinition)
- `packages/core/src/index.ts` (remove module exports)
- `packages/core/src/vertz.ts` (remove module from namespace)
- `packages/core/src/app/app-builder.ts` (remove .register())
- `packages/core/src/app/app-runner.ts` (remove module resolution)
- `packages/core/src/app/route-log.ts` (remove collectRoutes())
- `packages/core/src/app/__tests__/*.test.ts` (~8 files)
- `packages/integration-tests/src/app/create-app.ts`
- `packages/integration-tests/src/__tests__/` (~4 test files)
- `packages/testing/src/test-app.ts` + tests (~3 files)
- `packages/server/src/__tests__/re-exports.test.ts`
- `examples/ssr-cloudflare/src/app.ts`
- `packages/create-vertz-app/src/templates/index.ts` + tests
- `packages/compiler/src/ir/entity-route-injector.ts`
- `packages/compiler/src/index.ts` (remove module public exports)
