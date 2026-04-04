# Phase 4: typed() Factory

## Context

Issue #2004: BaseContext exposes auth/tenancy fields regardless of app configuration. Phases 1-3 established the type foundation and added `TFeatures` to EntityConfig/ServiceConfig. This phase implements the `typed()` factory — the primary developer-facing API — which returns narrowed `entity()` and `service()` functions.

Design doc: `plans/2004-base-context-conditional-types.md` (Rev 3, Section 5 "typed()")

## Tasks

### Task 1: typed() implementation + TypedFactories type

**Files:** (3)
- `packages/server/src/typed.ts` (modified — add typed() function and TypedFactories)
- `packages/server/src/__tests__/typed.test.ts` (new)
- `packages/server/src/__tests__/typed.test-d.ts` (new)

**What to implement:**

1. Add `TypedFactories` interface and `typed()` function to `typed.ts`:

```typescript
import type { AuthConfig } from './auth/types';
import type { ContextFeatures, EntityConfig, EntityDefinition, EntityActionDef, FullFeatures } from './entity/types';
import type { ServiceConfig, ServiceDefinition, ServiceActionDef } from './service/types';
import type { ModelDef } from '@vertz/db';
import { entity } from './entity/entity';
import { service } from './service/service';

// TypedFactories — entity/service with narrowed TFeatures
export interface TypedFactories<F extends ContextFeatures> {
  entity: <
    TModel extends ModelDef,
    TInject extends Record<string, EntityDefinition> = {},
    TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  >(
    name: string,
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

// typed() — runtime no-op, type-level narrowing
export function typed<TAuth extends AuthConfig | undefined>(
  auth?: TAuth,
): TypedFactories<InferFeatures<TAuth>> {
  return { entity, service } as TypedFactories<InferFeatures<TAuth>>;
}
```

Note: `typed()` signature matches actual `entity(name, config)` / `service(name, config)` call patterns.

2. Write runtime tests:

```typescript
describe('typed()', () => {
  it('returns entity and service functions', () => {
    const t = typed();
    expect(typeof t.entity).toBe('function');
    expect(typeof t.service).toBe('function');
  });

  it('t.entity() creates the same EntityDefinition as standalone entity()', () => {
    const t = typed();
    const def = t.entity('tasks', { model: tasksModel });
    expect(def.kind).toBe('entity');
    expect(def.name).toBe('tasks');
  });

  it('t.service() creates the same ServiceDefinition as standalone service()', () => {
    const t = typed();
    const def = t.service('reports', {
      actions: {
        generate: { response: schema, handler: async () => ({}) },
      },
    });
    expect(def.kind).toBe('service');
    expect(def.name).toBe('reports');
  });

  it('accepts auth config and returns factories', () => {
    const auth = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
    const t = typed(auth);
    expect(typeof t.entity).toBe('function');
  });
});
```

3. Write comprehensive type-level tests (E2E acceptance tests from design doc):

```typescript
// Test 1: No-auth — typed() removes auth/tenant fields
// Test 2: Auth-only — auth fields present, tenant absent
// Test 3: Auth + tenant — tenant present, tenantLevel absent
// Test 4: Auth + multi-level — all fields
// Test 5: typed() entity output is same EntityDefinition type
// Test 6: typed() with defineAuth preserves literal type for InferFeatures
```

**Acceptance criteria:**
- [ ] `typed()` returns `{ entity, service }` at runtime
- [ ] `typed().entity(name, config)` produces identical output to `entity(name, config)`
- [ ] `typed(auth).entity()` narrows ctx in before/after hooks to only auth fields
- [ ] `typed().entity()` produces ctx with NO auth/tenant fields (NoFeatures)
- [ ] `typed(authWithTenant).entity()` shows auth + tenant but NOT tenantLevel
- [ ] `typed(authWithMultiLevel).entity()` shows all fields including tenantLevel
- [ ] `typed(auth).service()` narrows ctx equivalently
- [ ] All type-level E2E acceptance tests from design doc pass
- [ ] Runtime tests pass
- [ ] Typecheck passes: `vtz run typecheck`

---

### Task 2: Exports + InferServerFeatures

**Files:** (3)
- `packages/server/src/index.ts` (modified)
- `packages/server/src/typed.ts` (modified — add InferServerFeatures, InferServerContext)
- `packages/server/src/__tests__/typed.test-d.ts` (modified — add InferServerFeatures tests)

**What to implement:**

1. Add `InferServerFeatures` and `InferServerContext` to `typed.ts`:

```typescript
import type { ServerConfig, CloudServerConfig } from './create-server';

export type InferServerFeatures<TConfig> =
  TConfig extends { auth: infer A } ? InferFeatures<A>
  : TConfig extends { cloud: CloudServerConfig } ? FullFeatures
  : NoFeatures;

export type InferServerContext<TConfig> =
  BaseContext<InferServerFeatures<TConfig>>;
```

2. Export everything from `index.ts`:

```typescript
// New exports
export type { ContextFeatures, FullFeatures, NoFeatures, AuthContext, TenantContext, MultiLevelTenantContext } from './entity/types';
export { typed } from './typed';
export type { TypedFactories, InferFeatures, InferServerFeatures, InferServerContext } from './typed';
```

3. Type-level tests for InferServerFeatures:

```typescript
type F1 = InferServerFeatures<{ db: any }>;           // NoFeatures
type F2 = InferServerFeatures<{ db: any; auth: ... }>; // auth: true
type F3 = InferServerFeatures<{ cloud: { projectId: 'x' } }>; // FullFeatures
```

**Acceptance criteria:**
- [ ] `typed`, `TypedFactories`, `InferFeatures`, `InferServerFeatures`, `InferServerContext` exported from `@vertz/server`
- [ ] `ContextFeatures`, `FullFeatures`, `NoFeatures`, `AuthContext`, `TenantContext`, `MultiLevelTenantContext` exported from `@vertz/server`
- [ ] `InferServerFeatures` correctly infers from `auth`, `cloud`, and neither
- [ ] Typecheck passes
