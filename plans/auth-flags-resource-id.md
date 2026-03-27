# Design: Align auth_flags with (resource_type, resource_id) pattern

**Issue:** [#1920](https://github.com/vertz-dev/vertz/issues/1920)
**Status:** Draft
**Related:** #1915 (auth_plans), #1787 (multi-level tenancy)

---

## API Surface

### Before

```typescript
export interface FlagStore {
  setFlag(tenantId: string, flag: string, enabled: boolean): void;
  getFlag(tenantId: string, flag: string): boolean;
  getFlags(tenantId: string): Record<string, boolean>;
}

// Usage
flagStore.setFlag('org-1', 'beta_ai', true);
flagStore.getFlag('org-1', 'beta_ai');
flagStore.getFlags('org-1');
```

### After

```typescript
export interface FlagStore {
  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void;
  getFlag(resourceType: string, resourceId: string, flag: string): boolean;
  getFlags(resourceType: string, resourceId: string): Record<string, boolean>;
}

// Usage
flagStore.setFlag('account', 'acct-1', 'beta_ai', true);
flagStore.getFlag('account', 'acct-1', 'beta_ai');
flagStore.getFlags('account', 'acct-1');
```

### Schema Change

```sql
-- Before
CREATE TABLE IF NOT EXISTS auth_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  flag TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  UNIQUE(tenant_id, flag)
);

-- After
CREATE TABLE IF NOT EXISTS auth_flags (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  flag TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  UNIQUE(resource_type, resource_id, flag)
);
```

### Model Change

```typescript
// Before
const authFlagsTable = d.table('auth_flags', {
  id: d.text().primary(),
  tenantId: d.text(),
  flag: d.text(),
  enabled: d.boolean().default(false),
});

// After
const authFlagsTable = d.table('auth_flags', {
  id: d.text().primary(),
  resourceType: d.text(),
  resourceId: d.text(),
  flag: d.text(),
  enabled: d.boolean().default(false),
});
```

### InMemoryFlagStore — Composite Key

Follows the same `key()` pattern as `InMemorySubscriptionStore`:

```typescript
export class InMemoryFlagStore implements FlagStore {
  private flags = new Map<string, Map<string, boolean>>();

  private key(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void {
    const k = this.key(resourceType, resourceId);
    let resourceFlags = this.flags.get(k);
    if (!resourceFlags) {
      resourceFlags = new Map();
      this.flags.set(k, resourceFlags);
    }
    resourceFlags.set(flag, enabled);
  }

  getFlag(resourceType: string, resourceId: string, flag: string): boolean {
    return this.flags.get(this.key(resourceType, resourceId))?.get(flag) ?? false;
  }

  getFlags(resourceType: string, resourceId: string): Record<string, boolean> {
    const resourceFlags = this.flags.get(this.key(resourceType, resourceId));
    if (!resourceFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of resourceFlags) {
      result[key] = value;
    }
    return result;
  }
}
```

### DbFlagStore — Updated SQL

```typescript
export class DbFlagStore implements FlagStore {
  private cache = new Map<string, Map<string, boolean>>();

  private key(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  async loadFlags(): Promise<void> {
    const result = await this.db.query<{
      resource_type: string;
      resource_id: string;
      flag: string;
      enabled: number | boolean;
    }>(sql`SELECT resource_type, resource_id, flag, enabled FROM auth_flags`);

    if (!result.ok) return;
    this.cache.clear();
    for (const row of result.data.rows) {
      const k = this.key(row.resource_type, row.resource_id);
      let resFlags = this.cache.get(k);
      if (!resFlags) {
        resFlags = new Map();
        this.cache.set(k, resFlags);
      }
      resFlags.set(row.flag, row.enabled === 1 || row.enabled === true);
    }
  }

  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void {
    const k = this.key(resourceType, resourceId);
    // ... cache update + fire-and-forget SQL with ON CONFLICT(resource_type, resource_id, flag)
  }
}
```

### Call Site Changes

**access-set.ts — multi-level resolution (line 184):**
```typescript
// Before
const levelFlags = flagStore.getFlags(entry.id);

// After
const levelFlags = flagStore.getFlags(entry.type, entry.id);
```

**access-set.ts — single-level resolution (line 206):**
```typescript
// Before
const orgFlags = flagStore.getFlags(tenantId);

// After — uses same default as subscription path (line 425)
const orgFlags = flagStore.getFlags(config.tenantLevel ?? 'tenant', tenantId);
```

> **Note:** The subscription store single-level path already defaults to `'tenant'` (access-set.ts:425). We use the same default for consistency.

**access-context.ts — checkLayers1to3 (lines 156, 313):**
```typescript
// Before
flagStore.getFlag(resolvedOrg.id, flag)

// After — resolvedOrg already has type info from orgResolver
flagStore.getFlag(resolvedOrg.type, resolvedOrg.id, flag)
```

> **Verified:** `resolvedOrg` is typed as `{ type: string; id: string } | null` (access-context.ts:143). No changes needed.

---

## Manifesto Alignment

- **Principle 3 (LLM-first):** The `(resourceType, resourceId)` pattern is already used by `SubscriptionStore`. Consistent patterns are easier for LLMs to predict and generate correctly.
- **Principle 6 (No Magic):** Explicit resource type removes the implicit assumption that IDs are globally unique across entity types.

### Tradeoffs

- **Breaking API change** — every `FlagStore` consumer must update call signatures. Pre-v1, this is encouraged.
- **Extra parameter in every call** — small ergonomic cost, but matches the established pattern across all other auth stores.

### Rejected Alternatives

1. **Keep `tenantId` but add `resourceType` as optional** — Half-migration creates two code paths. Rejected for same reason #1915 rejected it.
2. **Use a single composite string `"account:acct-1"` as the key** — Matches InMemory cache key, but DB schema should have separate columns for indexing and querying. Rejected.

---

## Non-Goals

- **Migration of existing data** — Pre-v1, no production data to migrate. Schema recreated on startup.
- **Changes to `access-context.ts` ancestor walking** — `access-context.ts` uses a simpler check path. Adding ancestor walking there is a separate concern (#1787 scope).
- **Changes to `ClosureStore`** — Already uses `(type, id)` composite. No changes needed.
- **Changes to `OverrideStore`** — `OverrideStore.get(tenantId)` has the same bare-ID pattern. The DB table (`auth_overrides`) already uses `(resource_type, resource_id)`, but the store interface doesn't surface it. Separate follow-up issue.
- **Changes to `WalletStore`** — `walletStore.getConsumption(tenantId, ...)` has the same bare-ID pattern. Separate follow-up issue.
- **Changes to `AccessEventBroadcaster`** — The broadcaster uses `orgId` as a WebSocket routing key (which org's connections to notify), not as a storage key. The `broadcastFlagToggle(orgId, ...)` method sends events to all connections for that org. In multi-level tenancy, the broadcaster correctly routes to the org that the client WebSocket is authenticated against. Changing the broadcaster to `(resourceType, resourceId)` would require reworking the WebSocket connection model, which is out of scope. Follow-up issue for consistency audit.

---

## Unknowns

None identified. All resolved during design:

1. ~~Does `resolvedOrg` in `access-context.ts` carry a `type` field?~~ **Resolved:** Yes — `resolvedOrg` is typed as `{ type: string; id: string } | null` (access-context.ts:143). No changes to `orgResolver` needed.
2. ~~Does `access-set.ts` have `tenantLevel` for the single-level path?~~ **Resolved:** Yes — `ComputeAccessSetConfig.tenantLevel` is optional. For single-level fallback, use `config.tenantLevel ?? 'tenant'` (matching the existing subscription store default at access-set.ts:425).

---

## Type Flow Map

```
FlagStore.setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean)
  ↓
InMemoryFlagStore.key(resourceType, resourceId) → composite cache key
DbFlagStore SQL → INSERT INTO auth_flags (resource_type, resource_id, flag, enabled)
  ↓
FlagStore.getFlags(resourceType: string, resourceId: string) → Record<string, boolean>
  ↓
access-set.ts:computeAccessSet → flagStore.getFlags(entry.type, entry.id)
  ↓ (multi-level)
ancestorChain[].type + ancestorChain[].id → flagStore.getFlags per level
  ↓
resolvedFlags: Record<string, boolean> → entitlement gating
```

No generics in this feature — all string parameters. Type flow is straightforward.

---

## E2E Acceptance Test

```typescript
describe('Feature: auth_flags with (resource_type, resource_id) pattern', () => {
  describe('Given flags set at account level', () => {
    describe('When getting flag for the same account resource', () => {
      it('Then returns the flag value', () => {
        const store = new InMemoryFlagStore();
        store.setFlag('account', 'acct-1', 'beta_ai', true);
        expect(store.getFlag('account', 'acct-1', 'beta_ai')).toBe(true);
      });
    });
  });

  describe('Given flags set for different resource types with same ID', () => {
    describe('When getting flags per resource type', () => {
      it('Then flags are isolated by resource type', () => {
        const store = new InMemoryFlagStore();
        store.setFlag('account', 'id-1', 'beta_ai', true);
        store.setFlag('project', 'id-1', 'beta_ai', false);
        expect(store.getFlag('account', 'id-1', 'beta_ai')).toBe(true);
        expect(store.getFlag('project', 'id-1', 'beta_ai')).toBe(false);
      });
    });
  });

  describe('Given multi-level tenancy with flags at account and project level', () => {
    describe('When computing access set at project level', () => {
      it('Then deepest-wins flag resolution uses (type, id) composite keys', async () => {
        const flagStore = new InMemoryFlagStore();
        flagStore.setFlag('account', 'acct-1', 'beta_ai', true);
        flagStore.setFlag('project', 'proj-1', 'beta_ai', false);

        const result = await computeAccessSet({
          userId: 'user-1',
          accessDef,
          roleStore,
          closureStore,
          flagStore,
          tenantId: 'proj-1',
          tenantLevel: 'project',
          ancestorResolver: mockAncestorResolver({
            'proj-1': [{ type: 'account', id: 'acct-1', depth: 1 }],
          }),
        });

        expect(result.flags['beta_ai']).toBe(false); // project overrides account
      });
    });
  });

});

// In flag-store.test-d.ts — type-level negative test
declare const store: FlagStore;
// @ts-expect-error — old 3-arg API shape should not compile
store.setFlag('org-1', 'beta_ai', true);
```

---

## Implementation Plan

### Phase 1: FlagStore interface + InMemoryFlagStore

**Changes:**
- `flag-store.ts` — Update `FlagStore` interface and `InMemoryFlagStore` implementation
- `auth-tables.ts` — Update `auth_flags` DDL
- `auth-models.ts` — Update `authFlagsTable` model
- `shared-flag-store.tests.ts` — Update shared test factory
- `flag-store.test.ts` — Update tests
- Add test: flags isolated by resource type (same ID, different type)

**Acceptance criteria:**
```typescript
describe('Given InMemoryFlagStore with (resourceType, resourceId) API', () => {
  describe('When setting flags for different resource types', () => {
    it('Then flags are isolated by resource type', () => {});
  });
  describe('When getting a flag with composite key', () => {
    it('Then returns correct value for the specific resource', () => {});
  });
  describe('When getting all flags for a resource', () => {
    it('Then returns only flags for that resource type + id', () => {});
  });
});
```

### Phase 2: DbFlagStore

**Changes:**
- `db-flag-store.ts` — Update SQL queries and cache key logic
- `db-flag-store.test.ts` — Update tests

**Acceptance criteria:**
```typescript
describe('Given DbFlagStore with (resourceType, resourceId) schema', () => {
  describe('When loading flags from DB', () => {
    it('Then hydrates cache with composite keys', () => {});
  });
  describe('When setting a flag', () => {
    it('Then persists with resource_type and resource_id columns', () => {});
  });
  describe('When upserting with ON CONFLICT', () => {
    it('Then conflicts on (resource_type, resource_id, flag) triple', () => {});
  });
});
```

### Phase 3: Call sites (access-set.ts, access-context.ts, integration tests)

**Changes:**
- `access-set.ts` — Pass `(entry.type, entry.id)` to flagStore methods; use `config.tenantLevel ?? 'tenant'` for single-level
- `access-context.ts` — Pass `(resolvedOrg.type, resolvedOrg.id)` to flagStore methods
- `multi-level-flag-resolution.test.ts` — Update to use composite keys
- `access-set.test.ts` — Update flag-related tests
- `access-context.test.ts` — Update flag-related tests
- `packages/integration-tests/src/__tests__/auth-db-stores.test.ts` — Update 7 `setFlag`/`getFlag` calls
- `packages/integration-tests/src/__tests__/reactive-invalidation.test.ts` — Update 10+ `setFlag` calls

**Acceptance criteria:**
```typescript
describe('Given multi-level flag resolution with composite keys', () => {
  describe('When flags are set at account and project levels', () => {
    it('Then deepest-wins uses (type, id) for lookup', () => {});
  });
  describe('When single-level tenancy is used', () => {
    it('Then falls back to tenantLevel as resource type', () => {});
  });
});
```

### Phase 4: Docs + changeset + follow-up issues

**Changes:**
- Update `packages/mint-docs/guides/server/auth.mdx` — FlagStore API change
- Add changeset (patch)
- File follow-up issue: align `OverrideStore` and `WalletStore` with `(resourceType, resourceId)` pattern
- File follow-up issue: `AccessEventBroadcaster` consistency audit for `orgId` → composite key
