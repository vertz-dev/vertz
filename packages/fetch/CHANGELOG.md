# @vertz/fetch

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
