# Phase 1: Entity Restructuring + Entitlements

**Prerequisites:** None — this is the first phase.

**Goal:** Rewrite `defineAccess()` to accept the new entity-centric config shape, implement hierarchy inference from `inherits` declarations, enforce all entity/entitlement validation rules, and update `createAccessContext()` to work with the new shape. Rewrite all existing tests.

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: API Surface, Migration, Hierarchy Inference, Validation Rules 1-11.

---

## Context — Read These First

Before implementing, read these files to understand the current API:

- `packages/server/src/auth/define-access.ts` — current `defineAccess()` implementation
- `packages/server/src/auth/access-context.ts` — current `createAccessContext()` and `can()`/`check()`/`authorize()`
- `packages/server/src/auth/rules.ts` — current rules builder (`rules.where`, `rules.all`, etc.)
- `packages/server/src/auth/closure-store.ts` — current `InMemoryClosureStore`
- `packages/server/src/auth/role-assignment-store.ts` — current `InMemoryRoleAssignmentStore`
- `packages/server/src/auth/types.ts` — current auth types
- `packages/server/src/auth/index.ts` — public API exports

---

## What to Implement

1. **New `DefineAccessInput` type** — `entities` object with `roles` and optional `inherits`, `entitlements` with object or callback format, optional `plans` and `defaultPlan` (plan structure is a stub in this phase — full implementation in Phase 2)
2. **Hierarchy inference algorithm** — parse `inherits` keys across all entities, build parent→child directed graph, topologically sort, validate linear chains, validate depth ≤ 4
3. **Entity validation (rules 1-8)** — inherits key format, inherits value validation, no self-reference, no cycles, linear chains only, depth limit, no duplicate roles, empty roles allowed
4. **Entitlement validation (rules 9-11)** — entity prefix must match, roles must be entity-scoped, callback format accepted
5. **Entitlement callback support** — `(r) => ({ roles, rules })` format where `r` provides `where()` and `user` context
6. **Inheritance direction validation (rules 20-21)** — inherits keys must reference ancestors, error messages guide developers from old direction
7. **Rewrite `createAccessContext()`** — accept new `AccessDefinition` shape, resolve roles via new inheritance structure, keep existing `can()`/`check()`/`authorize()` API
8. **Update `computeAccessSet()`** — work with new entity-centric shape
9. **Update `computeEntityAccess()`** — work with new shape
10. **Update public API exports** — `packages/server/src/auth/index.ts`
11. **Rewrite ALL existing tests** — every test file in `packages/server/src/auth/__tests__/` and `packages/integration-tests/src/__tests__/` that uses `defineAccess()` must use the new shape
12. **Freeze output** — `Object.freeze()` on all config objects returned by `defineAccess()`

---

## Files to Modify

```
packages/server/src/auth/
├── define-access.ts          # REWRITE — new input type, hierarchy inference, validation
├── access-context.ts         # MODIFY — use new AccessDefinition shape
├── access-set.ts             # MODIFY — use new shape
├── entity-access.ts          # MODIFY — use new shape
├── rules.ts                  # MODIFY — callback rule context type
├── types.ts                  # MODIFY — update AuthAccessConfig
├── closure-store.ts          # MODIFY — validate against inferred hierarchy
├── role-assignment-store.ts  # MODIFY — use entity names (lowercase)
├── index.ts                  # MODIFY — update exports
```

### Test Files to Rewrite

```
packages/server/src/auth/__tests__/
├── define-access.test.ts       # REWRITE
├── define-access.test-d.ts     # REWRITE — type-level tests for new shape
├── access-context.test.ts      # REWRITE
├── access-set.test.ts          # REWRITE
├── access-set-jwt.test.ts      # REWRITE
├── entity-access.test.ts       # REWRITE
├── closure-store.test.ts       # REWRITE (entity names now lowercase)
├── role-assignment-store.test.ts # REWRITE
├── rules.test.ts               # MODIFY — add callback entitlement tests

packages/integration-tests/src/__tests__/
├── resource-hierarchy.test.ts  # REWRITE
├── auth-access-set.test.ts     # REWRITE
├── reactive-invalidation.test.ts # MODIFY
```

---

## Expected Behaviors to Test

### defineAccess() — new input shape (`define-access.test.ts`)

```typescript
describe('Feature: Entity-centric defineAccess()', () => {
  describe('Given a valid entities config', () => {
    describe('When calling defineAccess()', () => {
      it('returns a frozen AccessDefinition', () => {})
      it('infers hierarchy from inherits declarations', () => {})
      it('hierarchy is ordered: org → team → project → task', () => {})
      it('entities without inherits are standalone roots', () => {})
    })
  })

  describe('Given inherits with invalid entity reference', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'nonexistent\' in team.inherits is not defined"', () => {})
    })
  })

  describe('Given inherits with invalid role reference', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Role \'nonexistent\' does not exist on entity \'organization\'"', () => {})
    })
  })

  describe('Given inherits value is not a valid role on the current entity', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Role \'nonexistent\' does not exist on entity \'team\'"', () => {})
    })
  })

  describe('Given self-referencing inheritance', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'team\' cannot inherit from itself"', () => {})
    })
  })

  describe('Given circular inheritance (A→B→A)', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Circular inheritance detected"', () => {})
    })
  })

  describe('Given entity with two parent entities in inherits', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'project\' inherits from multiple parents"', () => {})
    })
  })

  describe('Given hierarchy deeper than 4 levels', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Hierarchy depth must not exceed 4 levels"', () => {})
    })
  })

  describe('Given duplicate roles in an entity', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Duplicate role \'admin\' in entity \'organization\'"', () => {})
    })
  })

  describe('Given entity with empty roles array', () => {
    describe('When calling defineAccess()', () => {
      it('succeeds — entities with no roles are valid', () => {})
    })
  })

  describe('Given inheritance direction is wrong (parent inherits from child)', () => {
    describe('When calling defineAccess()', () => {
      it('throws with guidance: "organization cannot inherit from team — move to team.inherits"', () => {})
    })
  })
})
```

### Entitlement validation (`define-access.test.ts`)

```typescript
describe('Feature: Entitlement validation', () => {
  describe('Given entitlement prefix does not match any entity', () => {
    it('throws "Entitlement \'unknown:view\' references undefined entity \'unknown\'"', () => {})
  })

  describe('Given entitlement roles include a role from another entity', () => {
    it('throws "Role \'owner\' in \'project:view\' does not exist on entity \'project\'"', () => {})
  })

  describe('Given entitlement with callback format', () => {
    it('accepts (r) => ({ roles, rules }) format', () => {})
    it('callback r provides where() method', () => {})
    it('callback r provides user.id marker', () => {})
  })

  describe('Given entitlement with both roles and rules in object format', () => {
    it('accepts { roles: [...], rules: [...] } format', () => {})
  })
})
```

### Type-level tests (`define-access.test-d.ts`)

```typescript
// Positive: valid config accepted
defineAccess({
  entities: { workspace: { roles: ['admin', 'member'] } },
  entitlements: { 'workspace:invite': { roles: ['admin'] } },
});

// Negative: @ts-expect-error — entities is required
defineAccess({ entitlements: {} });

// Negative: @ts-expect-error — roles must be string array
defineAccess({ entities: { workspace: { roles: [123] } } });
```

### Access context with new shape (`access-context.test.ts`)

- [ ] `can()` returns true when user has direct role granting entitlement
- [ ] `can()` returns false when user lacks required role
- [ ] `can()` returns false for unauthenticated user (userId: null)
- [ ] `can()` resolves inherited roles (org admin → team editor → project contributor)
- [ ] `check()` returns `{ allowed: true, reasons: [] }` when granted
- [ ] `check()` returns `{ allowed: false, reason: 'role_required' }` when denied
- [ ] `check()` returns `{ allowed: false, reason: 'not_authenticated' }` for null user
- [ ] `authorize()` does not throw when authorized
- [ ] `authorize()` throws AuthorizationError when denied
- [ ] Most permissive role wins across direct + inherited
- [ ] Inherited role wins over less permissive direct assignment
- [ ] Callback entitlement rules evaluate against entity data
- [ ] `rules.where({ createdBy: r.user.id })` matches entity owner
- [ ] `rules.where({ createdBy: r.user.id })` denies non-owner

### Integration tests (`resource-hierarchy.test.ts`)

- [ ] Org admin inherits editor on team and contributor on project
- [ ] Closure table insert maintains ancestor paths
- [ ] Closure table delete cascades closure rows
- [ ] Entity names are lowercase in the new API
- [ ] `rules.*` combinators work inside entitlements

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/server/src/auth/
bun test --filter @vertz/server
bun run typecheck --filter @vertz/server
bun test --filter @vertz/integration-tests
bun run typecheck --filter @vertz/integration-tests
```

---

## Notes

- **This is a hard break.** The old `defineAccess()` shape is removed entirely. No backward compatibility.
- Entity names are **lowercase** in the new API (`organization` not `Organization`). The closure store and role assignment store must accept lowercase entity names. Existing tests that use uppercase names must be rewritten.
- The `AccessDefinition` return type must include the inferred `hierarchy` array (computed from `inherits`) so downstream code (access context, access set, closure store) can use it.
- Plan validation rules (12-19) are NOT implemented in this phase. The `plans` field in `DefineAccessInput` is typed but validation is deferred to Phase 2.
- The schema generic (`defineAccess<typeof schema>()`) for callback type safety is a stretch goal for this phase. If it adds complexity, defer to a follow-up. The runtime behavior works without it — `r.where()` accepts `Record<string, unknown>` as fallback.
- Do NOT touch `access-event-broadcaster.ts`, `wallet-store.ts`, `plan-store.ts`, `flag-store.ts`, or `billing-period.ts` in this phase — they are modified in later phases.
