# Design: Conditional BaseContext Types (#2004)

**Rev 3** — Addresses all DX, Product, and Technical review feedback.

## Problem

`BaseContext` in `packages/server/src/entity/types.ts` hardcodes auth and tenancy fields:

```typescript
export interface BaseContext {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly tenantLevel?: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}
```

Every `EntityContext` and `ServiceContext` inherits these fields — even in apps with no auth or tenancy configured. A developer sees `ctx.tenantId` in autocomplete and assumes multi-tenancy is active, when in reality it's always `null`. This violates principles #1 ("If it builds, it works" — the type suggests features that don't exist) and #3 ("AI agents are first-class users" — LLMs see `ctx.role()` and assume RBAC is configured).

## API Surface

### 1. Context Feature Flags

A type that describes which features are active. Developers never write this manually — it's inferred from configuration.

```typescript
export interface ContextFeatures {
  auth: boolean;
  tenant: boolean;
  multiLevelTenant: boolean;
}

// Convenience aliases (exported for advanced use)
export type FullFeatures = { auth: true; tenant: true; multiLevelTenant: true };
export type NoFeatures = { auth: false; tenant: false; multiLevelTenant: false };
```

### 2. Mixin Interfaces

```typescript
export interface AuthContext {
  readonly userId: string | null;
  authenticated(): boolean;
  role(...roles: string[]): boolean;
}

export interface TenantContext {
  readonly tenantId: string | null;
  tenant(): boolean;
}

export interface MultiLevelTenantContext {
  readonly tenantLevel: string | null;
}
```

### 3. Conditional BaseContext

```typescript
export type BaseContext<TFeatures extends ContextFeatures = FullFeatures> =
  (TFeatures['auth'] extends true ? AuthContext : {}) &
  (TFeatures['tenant'] extends true ? TenantContext : {}) &
  (TFeatures['multiLevelTenant'] extends true ? MultiLevelTenantContext : {});
```

The default parameter is `FullFeatures`, so existing code that uses `BaseContext` without a type parameter sees the same shape as today.

### 4. Prerequisite: `defineAuth()` Must Preserve Literal Types

The current `defineAuth` signature erases the literal config type:

```typescript
// CURRENT — widens to AuthConfig, loses literal shape
export function defineAuth(config: AuthConfig): AuthConfig {
  return config;
}
```

For `InferFeatures` to distinguish configs with/without `tenant`, `defineAuth` must become generic:

```typescript
// NEW — preserves the literal type for type-level inference
export function defineAuth<T extends AuthConfig>(config: T): T {
  return config;
}
```

This is a non-breaking change — existing call sites infer a narrower return type, which is a subtype of `AuthConfig`. All existing consumers that expect `AuthConfig` continue to work.

### 5. `typed()` — Config-Scoped Entity/Service Factory

This is the primary developer-facing API change. `typed()` accepts an auth config and returns narrowed `entity()` and `service()` factories:

```typescript
import { typed, defineAuth, entity } from '@vertz/server';

const auth = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });

// typed() infers ContextFeatures from the auth config
const t = typed(auth);

// t.entity() narrows hook ctx types to only show auth fields
const tasksEntity = t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.userId;        // string | null — available
      ctx.authenticated(); // boolean — available
      ctx.tenantId;      // @ts-expect-error — no tenancy configured
      return data;
    },
  },
});

// t.service() narrows too
const reports = t.service('reports', {
  actions: {
    generate: {
      response: reportSchema,
      handler: async (input, ctx) => {
        ctx.userId;    // available
        ctx.tenantId;  // @ts-expect-error
        return generateReport(input);
      },
    },
  },
});

// createServer() accepts entities from both typed() and standalone entity()
const server = createServer({
  db,
  auth,
  entities: [tasksEntity],
  services: [reports],
});
```

**How `typed()` works:**

```typescript
// The TypedFactories interface — adjusts generic defaults on entity/service factories
interface TypedFactories<F extends ContextFeatures> {
  entity: <
    TModel extends ModelDef,
    TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
    TInject extends Record<string, EntityDefinition> = {},
  >(
    config: EntityConfig<TModel, TActions, TInject, F>,
  ) => EntityDefinition<TModel, TActions>;

  service: <
    TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<string, ServiceActionDef>,
    TInject extends Record<string, EntityDefinition> = {},
  >(
    name: string,
    config: ServiceConfig<TActions, TInject, F>,
  ) => ServiceDefinition<TActions>;
}

// typed() implementation — runtime no-op, type-level narrowing
export function typed<TAuth extends AuthConfig | undefined>(
  auth?: TAuth,
): TypedFactories<InferFeatures<TAuth>> {
  return { entity, service } as TypedFactories<InferFeatures<TAuth>>;
}
```

At runtime, `typed()` is a no-op identity function — it returns the same `entity` and `service` functions. The `TypedFactories<F>` type adjusts the generic defaults so hook parameters use `BaseContext<F>` instead of `BaseContext<FullFeatures>`.

**Why the `as` cast is safe:** `TypedFactories<F>` only narrows the *input* types (what the developer writes in config). The *output* types (`EntityDefinition`, `ServiceDefinition`) are unchanged. At runtime, `entity()` and `service()` are the exact same functions. The cast is a type-level override, not a runtime lie.

**No `typed()`? Existing API unchanged:**

```typescript
// Standalone entity() still works — ctx has FullFeatures (all fields)
const tasks = entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.userId;    // still available (FullFeatures default)
      ctx.tenantId;  // still available (FullFeatures default)
      return data;
    },
  },
});
```

### 5. Tiered Developer Experience

#### No auth, no tenancy

```typescript
const t = typed();  // or typed(undefined)

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.userId;       // @ts-expect-error
      ctx.tenantId;     // @ts-expect-error
      ctx.authenticated; // @ts-expect-error
      // ctx only has: entity, entities
      return data;
    },
  },
});
```

#### Auth only (no tenancy)

```typescript
const auth = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.userId;        // string | null
      ctx.authenticated(); // boolean
      ctx.role('admin');   // boolean
      ctx.tenantId;      // @ts-expect-error
      ctx.tenantLevel;   // @ts-expect-error
      return data;
    },
  },
});
```

#### Auth + tenancy (single-level)

```typescript
const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true },
});
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.userId;        // string | null
      ctx.tenantId;      // string | null
      ctx.tenant();      // boolean
      ctx.tenantLevel;   // @ts-expect-error — multi-level not configured
      return data;
    },
  },
});
```

#### Auth + multi-level tenancy

```typescript
const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: {
    verifyMembership: async () => true,
    multiLevel: true,  // explicit opt-in
  },
});
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      ctx.tenantLevel; // string | null — available
      return data;
    },
  },
});
```

### 7. Feature Detection Type

```typescript
type InferFeatures<TAuth> = {
  auth: TAuth extends AuthConfig ? true : false;
  tenant: TAuth extends { tenant: TenantConfig } ? true : false;
  multiLevelTenant: TAuth extends { tenant: { multiLevel: true } } ? true : false;
};
```

`multiLevelTenant` defaults to `false`. It's only `true` when the tenant config explicitly includes `multiLevel: true`. This avoids showing `tenantLevel` in autocomplete for single-level tenant apps (the common case).

### 8. EntityContext and ServiceContext — No New Generic Parameter

`EntityContext` and `ServiceContext` do NOT gain a `TFeatures` parameter. They always extend `BaseContext` (defaults to `FullFeatures`). The narrowing happens at the config level — hook parameter types are what narrow, not the context interfaces.

```typescript
// UNCHANGED — no TFeatures parameter
export interface EntityContext<
  TModel extends ModelDef = ModelDef,
  TInject extends Record<string, EntityDefinition> = {},
> extends BaseContext {  // BaseContext defaults to FullFeatures
  readonly entity: EntityOperations<TModel>;
  readonly entities: InjectToOperations<TInject>;
}
```

#### EntityConfig — TFeatures narrows hook parameters

```typescript
export interface EntityConfig<
  TModel extends ModelDef = ModelDef,
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  readonly before?: {
    readonly create?: (
      data: TModel['table']['$create_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$create_input'] | Promise<TModel['table']['$create_input']>;
    readonly update?: (
      data: TModel['table']['$update_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$update_input'] | Promise<TModel['table']['$update_input']>;
  };
  readonly after?: {
    readonly create?: (
      result: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
    // update, delete follow the same pattern
  };
  readonly actions?: {
    readonly [K in keyof TActions]: TActions[K];
  };
  // ... other fields unchanged
}
```

#### ServiceConfig — Same TFeatures pattern

```typescript
export interface ServiceConfig<
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<string, ServiceActionDef>,
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<Extract<keyof NoInfer<TActions>, string>, AccessRule>>;
  readonly actions: {
    readonly [K in keyof TActions]: TActions[K] extends ServiceActionDef<infer TIn, infer TOut, any>
      ? {
          readonly method?: string;
          readonly path?: string;
          readonly body?: SchemaLike<TIn>;
          readonly response: SchemaLike<TOut>;
          readonly handler: (
            input: TIn,
            ctx: BaseContext<TFeatures> & {
              readonly entities: InjectToOperations<TInject>;
              readonly request: ServiceRequestInfo;
            },
          ) => Promise<TOut | ResponseDescriptor<TOut>>;
        }
      : TActions[K];
  };
}
```

**Why inline intersection instead of `ServiceContext<TInject>`:** `ServiceContext<TInject>` extends `BaseContext` (always `FullFeatures`). To narrow the context, the handler parameter must use `BaseContext<TFeatures>` intersected with the service-specific fields (`entities`, `request`). This inline intersection is structurally identical to `ServiceContext` when `TFeatures = FullFeatures`, maintaining backwards compat.

**Structural subtyping makes this safe:** At runtime, the route handler constructs a full `ServiceContext` object (all fields present) and passes it to the handler function. TypeScript allows passing a wider object to a function expecting a narrower parameter type (structural subtyping: `{ a, b, c }` is assignable to `{ a }`). The developer's handler receives the full object but only sees the narrowed type in autocomplete.

#### EntityActionDef — TFeatures narrows action handler ctx

```typescript
export interface EntityActionDef<
  TInput = unknown,
  TOutput = unknown,
  TResponse = unknown,
  TCtx = BaseContext & { readonly entity: EntityOperations; readonly entities: Record<string, EntityOperations> },
> {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    ctx: TCtx,
    row: TResponse | null,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}
```

The `TCtx` parameter on `EntityActionDef` continues to default to `FullFeatures` context. When used inside `TypedFactories<F>.entity()`, the `TCtx` is inferred from the `EntityConfig<..., F>` hook types, ensuring consistent narrowing across hooks and actions.

### 9. Internal Plumbing — FullFeatures Always

The access enforcer, context construction, route generators, and all internal code continue to use `BaseContext` (defaults to `FullFeatures`). At runtime, the context object always has all fields — they return `null`/`false` when not configured.

```typescript
// Access enforcer — unchanged, uses default FullFeatures
export async function enforceAccess(
  operation: string,
  accessRules: Partial<Record<string, AccessRule>>,
  ctx: BaseContext,  // = BaseContext<FullFeatures>
  row?: Record<string, unknown>,
  options?: EnforceAccessOptions & { skipWhere?: boolean },
): Promise<Result<void, EntityForbiddenError>> { ... }
```

This is safe because the runtime context object always satisfies `BaseContext<FullFeatures>`. The developer-facing type narrowing is a compile-time concern only — at runtime, a "no-auth" context object still has `userId: null`, `authenticated() => false`, etc.

### 10. Cloud Mode

When `cloud` config is present (instead of `auth`), `typed()` is not used — cloud mode delegates auth entirely to the proxy. Entity hooks in cloud apps should use the standalone `entity()` which defaults to `FullFeatures`, since the cloud proxy always provides full auth context.

Cloud-specific feature detection may be added in a future iteration if needed.

### 11. Context Type Extraction Utility

For tests and advanced use cases, we export a utility type to extract the context features from a server config:

```typescript
export type InferServerFeatures<TConfig extends ServerConfig> =
  TConfig extends { auth: infer A } ? InferFeatures<A>
  : TConfig extends { cloud: CloudServerConfig } ? FullFeatures
  : NoFeatures;

export type InferServerContext<TConfig extends ServerConfig> =
  BaseContext<InferServerFeatures<TConfig>>;
```

## Manifesto Alignment

### Principles Served

- **#1 "If it builds, it works"** — When auth isn't configured, `ctx.userId` doesn't exist at the type level. The compiler catches misuse.
- **#2 "One way to do things"** — `typed(auth)` is the single pattern for narrowed contexts. No ambiguity.
- **#3 "AI agents are first-class users"** — LLMs see only the fields that are actually available. No misleading `ctx.role()` in apps without RBAC.
- **Explicit over implicit** — The type system makes the configured features explicit in the context shape.

### Tradeoffs

- **New `typed()` API** — Developers must learn one new function. The function is a pure type-level helper (no-op at runtime), so the cognitive cost is low. Existing code continues to work without it.
- **More complex internal type definitions** — `BaseContext` becomes a conditional intersection type. This complexity is hidden from developers.

### Alternatives Rejected

- **Runtime-only approach** — Throwing at runtime when `ctx.tenantId` is accessed without tenancy. Violates "if it builds, it works."
- **Separate context classes** — `AuthEntityContext`, `TenantEntityContext`, etc. Combinatorial explosion (auth x tenant x multiLevel x inject), violates "one way to do things."
- **Documentation-only** (option 3 from the issue) — Doesn't solve the DX problem. LLMs and autocomplete still show misleading fields.
- **Narrow at `createServer()` only, entity hooks keep FullFeatures** — Doesn't fix the primary pain point (autocomplete in entity hooks where developers write code).
- **Generic parameter on `EntityContext`/`ServiceContext`** — Would be a dead generic since entity definitions always use the default. Features belong on `BaseContext` and `EntityConfig` only.
- **`createServerConfig().entity()` builder pattern** — Changes the entire API surface (define config → define entities → build server). Too big for this issue scope. `typed()` achieves the same type narrowing with minimal API surface change.

## Non-Goals

- **Custom context extensions** — This design doesn't add arbitrary user-defined fields to context.
- **Changing runtime behavior** — The runtime context object still has all fields (with `null` values). Only the type narrows. This is purely a compile-time change.
- **Access rule type narrowing** — `rules.*` descriptors remain untyped relative to context features. They're declarative data; the enforcer handles evaluation.
- **Cloud mode narrowing** — Cloud-managed auth always provides full context. `typed()` is for self-hosted auth.
- **Entity hook narrowing without `typed()`** — Standalone `entity()` keeps `FullFeatures` by default. Developers must opt in via `typed(auth)` to get narrowed types.

## Unknowns

### 1. Feature detection accuracy for `tenant`

**Question:** Can we reliably detect tenant configuration at the type level from `AuthConfig`?

**Resolution:** Yes. `AuthConfig.tenant` is typed as `TenantConfig | false | undefined`. The conditional type `TAuth extends { tenant: TenantConfig } ? true : false` cleanly distinguishes the cases.

### 2. `multiLevel` flag on TenantConfig

**Question:** Where should the `multiLevel: true` opt-in live?

**Resolution:** On `TenantConfig` itself as an optional boolean field. When present and `true`, `InferFeatures` sets `multiLevelTenant: true`. This aligns with the existing `_resolveTenantLevel` internal field which is auto-wired by `createServer()` for multi-level tenancy. The public-facing `multiLevel` flag becomes the type-level signal.

### 3. Structural compatibility with `@vertz/agents`

**Question:** `@vertz/agents` has a structural `BaseContextLike` mirror in `create-agent-runner.ts`. Does this break?

**Resolution:** No. `BaseContextLike` structurally matches `BaseContext<FullFeatures>`. At runtime, the context object passed to agent runners always has all fields. The structural type continues to work. We add a `.test-d.ts` in `@vertz/agents` asserting `BaseContext extends BaseContextLike` to catch future drift.

## Type Flow Map

```
AuthConfig (from defineAuth)
      │
      ▼
typed(auth)  →  InferFeatures<TAuth>  →  ContextFeatures
      │                                        │
      ▼                                        ▼
t.entity()                            BaseContext<TFeatures>
      │                                = AuthContext & TenantContext & ...  (conditional)
      ▼
EntityConfig<TModel, TActions, TInject, TFeatures>
      │
      ▼
Hook parameter: BaseContext<TFeatures> & { entity, entities }
      │
      ▼
Developer sees only configured fields in autocomplete
```

**Internal path (unchanged):**
```
createEntityContext(requestInfo, ops, registry)
      │
      ▼
EntityContext<TModel, TInject>  (extends BaseContext = BaseContext<FullFeatures>)
      │
      ▼
enforceAccess(op, rules, ctx: BaseContext)  ← always FullFeatures
```

**Dead generic check:** `TFeatures` in `BaseContext<TFeatures>` is consumed by all three conditionals. `TFeatures` in `EntityConfig` is consumed by the hook parameter types. No dead parameters.

## Impact on Existing Code

### Examples

| Example | Config | Effect |
|---------|--------|--------|
| `examples/contacts-api` | No auth | Benefits most — can use `typed()` to remove ctx noise |
| `examples/entity-todo` | No auth | Same as contacts-api |
| `examples/linear` | Auth + tenancy | Can use `typed(auth)` for full narrowed context |

Examples are not required to adopt `typed()` in this PR. They can be updated in a follow-up.

### Internal files (packages/server/src)

| File | Change |
|------|--------|
| `entity/types.ts` | BaseContext becomes generic. Mixin interfaces added. EntityConfig gains TFeatures. |
| `entity/context.ts` | No change (runtime construction unchanged) |
| `entity/access-enforcer.ts` | No change (uses `BaseContext` default = FullFeatures) |
| `entity/expose-evaluator.ts` | No change (uses `BaseContext` default) |
| `service/types.ts` | ServiceConfig gains TFeatures for handler parameter types |
| `agent/types.ts` | No change (AgentRunnerFn uses `BaseContext` default) |
| `auth/types.ts` | TenantConfig gains `multiLevel?: boolean` public field |
| `define-auth.ts` | `defineAuth` becomes generic: `<T extends AuthConfig>(config: T): T` |
| `index.ts` | Export new types: ContextFeatures, AuthContext, TenantContext, typed(), etc. |
| New: `typed.ts` | `typed()` function, TypedFactories type, InferFeatures type |

### Tests

| File | Change |
|------|--------|
| `entity/__tests__/access-enforcer.test.ts` | No change — uses `BaseContext` default |
| `entity/__tests__/expose-evaluator.test.ts` | No change — uses `BaseContext` default |
| `service/__tests__/service.test-d.ts` | No change — `ServiceContext extends BaseContext` still holds |
| New: `__tests__/typed.test-d.ts` | Type-level tests for feature inference and narrowing |
| New: `__tests__/typed.test.ts` | Runtime tests for typed() factory |

### Docs

Update `packages/docs/` (or `packages/mint-docs/` if applicable) to document:
- `typed()` API and usage
- Context features concept
- Migration guide (optional, since existing code is unaffected)

## E2E Acceptance Test

### Test 1: No-auth app — `typed()` removes all auth/tenant fields

```typescript
// typed.test-d.ts
import { typed } from '@vertz/server';

const t = typed();

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      // @ts-expect-error — userId does not exist on no-auth context
      ctx.userId;
      // @ts-expect-error — tenantId does not exist
      ctx.tenantId;
      // @ts-expect-error — authenticated does not exist
      ctx.authenticated;
      // OK — entity operations are always available
      ctx.entity;
      return data;
    },
  },
});
```

### Test 2: Auth-only app — auth fields present, tenant fields absent

```typescript
// typed.test-d.ts
import { typed, defineAuth } from '@vertz/server';

const auth = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      // OK — auth fields
      const _userId: string | null = ctx.userId;
      const _auth: boolean = ctx.authenticated();
      const _role: boolean = ctx.role('admin');

      // @ts-expect-error — no tenancy configured
      ctx.tenantId;
      // @ts-expect-error
      ctx.tenant;

      return data;
    },
  },
});
```

### Test 3: Auth + tenant — auth and tenant fields present, tenantLevel absent

```typescript
// typed.test-d.ts
const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true },
});
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      const _userId: string | null = ctx.userId;
      const _tenantId: string | null = ctx.tenantId;
      const _auth: boolean = ctx.authenticated();
      const _tenant: boolean = ctx.tenant();

      // @ts-expect-error — multiLevel not configured
      ctx.tenantLevel;

      return data;
    },
  },
});
```

### Test 4: Auth + multi-level tenant — all fields present

```typescript
// typed.test-d.ts
const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true, multiLevel: true },
});
const t = typed(auth);

t.entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      const _level: string | null = ctx.tenantLevel; // OK — multiLevel opt-in
      return data;
    },
  },
});
```

### Test 5: Default BaseContext (no type param) — backwards compat

```typescript
// typed.test-d.ts
import type { BaseContext } from '@vertz/server';

const ctx = {} as BaseContext;
const _userId: string | null = ctx.userId;
const _tenantId: string | null = ctx.tenantId;
ctx.authenticated();
ctx.tenant();
ctx.role('admin');
```

### Test 6: Standalone entity() — unchanged, uses FullFeatures

```typescript
// typed.test-d.ts
import { entity } from '@vertz/server';

entity({
  name: 'tasks',
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      // All fields available — FullFeatures default
      ctx.userId;
      ctx.tenantId;
      ctx.authenticated();
      return data;
    },
  },
});
```

### Test 7: InferServerFeatures utility type

```typescript
// typed.test-d.ts
import type { InferServerFeatures, ServerConfig } from '@vertz/server';

type NoAuthConfig = { db: any; entities: [] };
type AuthConfig = { db: any; auth: { session: { strategy: 'jwt'; ttl: '1h' } }; entities: [] };

type F1 = InferServerFeatures<NoAuthConfig>;
// F1['auth'] is false

type F2 = InferServerFeatures<AuthConfig>;
// F2['auth'] is true
```

### Test 8: Runtime — context object always has all fields

```typescript
// typed.test.ts (runtime)
import { createEntityContext } from '../entity/context';

it('runtime context has all methods regardless of type narrowing', () => {
  const ctx = createEntityContext({}, entityOps, registryProxy);

  // Runtime: all methods exist and return safe defaults
  expect(ctx.authenticated()).toBe(false);
  expect(ctx.tenant()).toBe(false);
  expect(ctx.role('admin')).toBe(false);
  expect(ctx.userId).toBeNull();
  expect(ctx.tenantId).toBeNull();
});
```

### Test 9: Structural compat — BaseContext extends agents' BaseContextLike

```typescript
// agents/typed-compat.test-d.ts
import type { BaseContext } from '@vertz/server';

interface BaseContextLike {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly tenantLevel?: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}

// Default BaseContext (FullFeatures) is assignable to BaseContextLike
const _compat: BaseContextLike = {} as BaseContext;
```
