# Phase 1: Foundation Types

## Context

Issue #2004: BaseContext exposes auth/tenancy fields regardless of app configuration. This phase establishes the type foundation: mixin interfaces, ContextFeatures, conditional BaseContext, InferFeatures, and prerequisite changes to defineAuth and TenantConfig.

Design doc: `plans/2004-base-context-conditional-types.md` (Rev 3)

## Tasks

### Task 1: Mixin interfaces + ContextFeatures + BaseContext

**Files:** (4)
- `packages/server/src/entity/types.ts` (modified)
- `packages/server/src/__tests__/base-context.test-d.ts` (new)
- `packages/server/src/entity/index.ts` (modified)
- `packages/server/src/index.ts` (modified)

**What to implement:**

1. In `entity/types.ts`, add the mixin interfaces and conditional BaseContext:

```typescript
// Mixin interfaces
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

// Feature flags
export interface ContextFeatures {
  auth: boolean;
  tenant: boolean;
  multiLevelTenant: boolean;
}

export type FullFeatures = { auth: true; tenant: true; multiLevelTenant: true };
export type NoFeatures = { auth: false; tenant: false; multiLevelTenant: false };

// Conditional BaseContext — replaces the old interface
export type BaseContext<TFeatures extends ContextFeatures = FullFeatures> =
  (TFeatures['auth'] extends true ? AuthContext : {}) &
  (TFeatures['tenant'] extends true ? TenantContext : {}) &
  (TFeatures['multiLevelTenant'] extends true ? MultiLevelTenantContext : {});
```

2. Remove the old `BaseContext` interface (replace with the new type alias).

3. `EntityContext` and `ServiceContext` remain unchanged — they extend `BaseContext` (defaults to `FullFeatures`).

4. Export the new types from `entity/index.ts` and `index.ts`.

**Acceptance criteria:**
- [ ] `BaseContext` (no type param) resolves to `AuthContext & TenantContext & MultiLevelTenantContext`
- [ ] `BaseContext<NoFeatures>` resolves to `{}`
- [ ] `BaseContext<{ auth: true; tenant: false; multiLevelTenant: false }>` has `userId`, `authenticated()`, `role()` but NOT `tenantId`, `tenant()`, `tenantLevel`
- [ ] `EntityContext` still extends `BaseContext` and has all fields (backwards compat)
- [ ] All existing tests pass without changes
- [ ] Typecheck passes: `vtz run typecheck`

---

### Task 2: defineAuth generic + TenantConfig.multiLevel

**Files:** (4)
- `packages/server/src/define-auth.ts` (modified)
- `packages/server/src/auth/types.ts` (modified)
- `packages/server/src/__tests__/define-auth-generic.test-d.ts` (new)
- `packages/server/src/__tests__/define-auth-generic.test.ts` (new)

**What to implement:**

1. Make `defineAuth` generic to preserve literal types:

```typescript
// define-auth.ts
export function defineAuth<T extends AuthConfig>(config: T): T {
  return config;
}
```

2. Add `multiLevel?: boolean` to `TenantConfig` in `auth/types.ts`:

```typescript
export interface TenantConfig {
  // ... existing fields ...
  /** Opt-in to multi-level tenancy type narrowing. When true, ctx.tenantLevel is available. */
  multiLevel?: boolean;
}
```

3. Write type-level tests in `.test-d.ts`:

```typescript
// Verify defineAuth preserves literal type
const authNoTenant = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
type T1 = typeof authNoTenant;
// T1 should NOT have tenant — verify with @ts-expect-error

const authWithTenant = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true },
});
type T2 = typeof authWithTenant;
// T2['tenant'] should be TenantConfig
```

4. Write runtime test verifying defineAuth still works as identity function.

**Acceptance criteria:**
- [ ] `defineAuth({ session, tenant })` return type preserves the literal tenant shape
- [ ] `defineAuth({ session })` return type does NOT include `tenant`
- [ ] `TenantConfig` accepts `multiLevel: true`
- [ ] Existing `defineAuth` consumers compile unchanged
- [ ] All existing tests pass
- [ ] Typecheck passes

---

### Task 3: InferFeatures type + backwards compat assertions

**Files:** (2)
- `packages/server/src/typed.ts` (new — just the types for now, `typed()` impl in Phase 4)
- `packages/server/src/__tests__/infer-features.test-d.ts` (new)

**What to implement:**

1. Create `typed.ts` with `InferFeatures` type:

```typescript
import type { AuthConfig } from './auth/types';
import type { ContextFeatures } from './entity/types';

export type InferFeatures<TAuth> = {
  auth: TAuth extends AuthConfig ? true : false;
  tenant: TAuth extends { tenant: { verifyMembership: (...args: any[]) => any } } ? true : false;
  multiLevelTenant: TAuth extends { tenant: { multiLevel: true } } ? true : false;
};
```

Note: `tenant` detection uses structural check for `verifyMembership` (the required field on `TenantConfig`) to avoid matching `tenant: false`.

2. Write type-level tests:

```typescript
// No auth
type F0 = InferFeatures<undefined>;
// F0 = { auth: false; tenant: false; multiLevelTenant: false }

// Auth only
type F1 = InferFeatures<{ session: { strategy: 'jwt'; ttl: '1h' } }>;
// F1 = { auth: true; tenant: false; multiLevelTenant: false }

// Auth + tenant
type F2 = InferFeatures<{ session: ...; tenant: { verifyMembership: ... } }>;
// F2 = { auth: true; tenant: true; multiLevelTenant: false }

// Auth + multi-level tenant
type F3 = InferFeatures<{ session: ...; tenant: { verifyMembership: ...; multiLevel: true } }>;
// F3 = { auth: true; tenant: true; multiLevelTenant: true }

// Auth + tenant: false (explicitly disabled)
type F4 = InferFeatures<{ session: ...; tenant: false }>;
// F4 = { auth: true; tenant: false; multiLevelTenant: false }
```

3. Add `InferServerFeatures` and `InferServerContext` utility types.

**Acceptance criteria:**
- [ ] `InferFeatures<undefined>` = `NoFeatures`
- [ ] `InferFeatures` correctly distinguishes all 4 tiers (no-auth, auth-only, auth+tenant, auth+multi-level)
- [ ] `InferFeatures<{ tenant: false }>` correctly detects no tenant
- [ ] `InferServerFeatures` works for server configs with `auth`, `cloud`, and neither
- [ ] Typecheck passes
