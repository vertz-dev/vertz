# @vertz/fetch

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.46

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.45

## 0.2.44

### Patch Changes

- [#2197](https://github.com/vertz-dev/vertz/pull/2197) [`8cdfc4c`](https://github.com/vertz-dev/vertz/commit/8cdfc4c136b2e570e68d5e5af99bcf0ec3420c35) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Force publish to sync README with npm registry

- Updated dependencies []:
  - @vertz/errors@0.2.44

## 0.2.43

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.43

## 0.2.42

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.42

## 0.2.41

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.41

## 0.2.40

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.40

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.39

## 0.2.38

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.38

## 0.2.37

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.37

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.36

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.35

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.34

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.33

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.32

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.31

## 0.2.30

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.30

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.29

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.28

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.27

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.26

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.25

## 0.2.24

### Patch Changes

- [#1707](https://github.com/vertz-dev/vertz/pull/1707) [`adea2f1`](https://github.com/vertz-dev/vertz/commit/adea2f15f306d09ecebc56fc1f3841ff4b14b2ba) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Auto-invalidate tenant-scoped queries on tenant switch. When `switchTenant()` succeeds, all active queries with `tenantScoped: true` metadata are automatically cleared and refetched, preventing stale cross-tenant data from being visible.

  **What changed:**

  - `EntityQueryMeta` now includes an optional `tenantScoped` boolean field
  - `registerActiveQuery()` accepts an optional `clearData` callback for data clearing before refetch
  - `invalidateTenantQueries()` exported from `@vertz/ui` — clears data + refetches all tenant-scoped queries
  - `TenantProvider.switchTenant()` calls `invalidateTenantQueries()` automatically on success
  - Codegen emits `tenantScoped: true/false` in entity SDK descriptors based on entity configuration
  - `QueryEnvelopeStore` gains a `delete(queryKey)` method for per-key cleanup

- [#1692](https://github.com/vertz-dev/vertz/pull/1692) [`99c90d9`](https://github.com/vertz-dev/vertz/commit/99c90d9d9176722d60d998a5a8d1eeaf4146c8de) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix resolveVertzQL to keep where/orderBy/limit as flat query params instead of encoding them in the base64 q= parameter. Only select and include are encoded in q= (structural, not human-readable). Where is flattened to bracket notation (where[field]=value), orderBy to colon format (orderBy=field:dir), and limit stays as a raw number. Server parser updated to support comma-separated multi-field orderBy.

- Updated dependencies []:
  - @vertz/errors@0.2.24

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.23

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.22

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.17

## 0.2.16

### Patch Changes

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

- Updated dependencies []:
  - @vertz/errors@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.14

## 0.2.13

### Patch Changes

- [#950](https://github.com/vertz-dev/vertz/pull/950) [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Automatic optimistic updates for entity mutations.

  EntityStore gains an optimistic layer stack (applyLayer/commitLayer/rollbackLayer) that overlays in-flight mutation patches on top of server-truth base data. MutationDescriptor in @vertz/fetch orchestrates the apply→fetch→commit/rollback lifecycle. The query() source switcher reads entity-backed data from EntityStore, so optimistic patches propagate reactively to all consuming queries. Generated createClient auto-wires the handler — zero boilerplate for `await api.todos.update(id, { completed: true })` to optimistically update all queries immediately.

- [#1003](https://github.com/vertz-dev/vertz/pull/1003) [`de34f8d`](https://github.com/vertz-dev/vertz/commit/de34f8dc9d3e69b507874f33d80bf7dc4420001d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add same-type query revalidation via MutationEventBus. Entity-backed queries now automatically revalidate when a mutation commits for the same entity type. Opt out per-mutation via `skipInvalidation: true` on MutationMeta.

- Updated dependencies [[`efda760`](https://github.com/vertz-dev/vertz/commit/efda76032901138dca7a22acd60ad947a4bdf02a), [`3d2799a`](https://github.com/vertz-dev/vertz/commit/3d2799ac4c3e0d8f65d864b4471e205a64db886a), [`7b125db`](https://github.com/vertz-dev/vertz/commit/7b125db968ba9157ce97932b392cb3be7fcc0344)]:
  - @vertz/errors@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/errors@0.2.5
