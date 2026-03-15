# @vertz/codegen

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.21

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.20

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.18

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.17

## 0.2.16

### Patch Changes

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1105](https://github.com/vertz-dev/vertz/pull/1105) [`6317fa3`](https://github.com/vertz-dev/vertz/commit/6317fa32f4f442451db00461b6f891388d66b99e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Wire create() mutations through OptimisticHandler for MutationEventBus emission, enabling automatic list query revalidation after entity creation

- [#1131](https://github.com/vertz-dev/vertz/pull/1131) [`ab3f364`](https://github.com/vertz-dev/vertz/commit/ab3f36478018245cc9473217a9a3bf7b04c6a5cb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Export EntitySchemaManifest, EntitySchemaManifestEntry, and EntitySchemaRelation types from @vertz/codegen. Update @vertz/ui-server to import from the canonical source instead of maintaining duplicate definitions.

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

- Updated dependencies [[`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea), [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb)]:
  - @vertz/compiler@0.2.16

## 0.2.15

### Patch Changes

- [#1102](https://github.com/vertz-dev/vertz/pull/1102) [`d0f0941`](https://github.com/vertz-dev/vertz/commit/d0f09419950bd0d6d9229a11fa9bf07f632fb85d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Generate router module augmentations so `useRouter()` picks up app route types by default after codegen.

  Change router navigation to use a TanStack-style input object with route patterns
  plus typed params, e.g. `navigate({ to: '/tasks/:id', params: { id: '123' } })`,
  with search params passed in the same object.

- Updated dependencies []:
  - @vertz/compiler@0.2.15

## 0.2.14

### Patch Changes

- Updated dependencies [[`3254588`](https://github.com/vertz-dev/vertz/commit/3254588a2cfb3590eebda53a4648256cc4d51139)]:
  - @vertz/compiler@0.2.14

## 0.2.13

### Patch Changes

- [#950](https://github.com/vertz-dev/vertz/pull/950) [`a5ceec8`](https://github.com/vertz-dev/vertz/commit/a5ceec812613d92f7261407e86b1a39993687a7a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Automatic optimistic updates for entity mutations.

  EntityStore gains an optimistic layer stack (applyLayer/commitLayer/rollbackLayer) that overlays in-flight mutation patches on top of server-truth base data. MutationDescriptor in @vertz/fetch orchestrates the apply→fetch→commit/rollback lifecycle. The query() source switcher reads entity-backed data from EntityStore, so optimistic patches propagate reactively to all consuming queries. Generated createClient auto-wires the handler — zero boilerplate for `await api.todos.update(id, { completed: true })` to optimistically update all queries immediately.

- [#1038](https://github.com/vertz-dev/vertz/pull/1038) [`3a79c2f`](https://github.com/vertz-dev/vertz/commit/3a79c2fad5bfbaed61f252cf2b908592e12a82bd) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Deep normalization for EntityStore — cross-entity reactive resolution.

  Write-side: `merge()` extracts nested entity objects, stores them separately, and replaces inline references with bare IDs. Read-side: `resolveReferences()` inside computed signals resolves bare IDs back to live entity objects, creating reactive subscriptions that propagate cross-entity updates automatically.

  Includes relation schema registry (`registerRelationSchema`), reference counting (`addRef`/`removeRef`), smart eviction (`evictOrphans`), and codegen integration to emit `registerRelationSchema` calls in generated client code.

- Updated dependencies []:
  - @vertz/compiler@0.2.13

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.11

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.8

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.6

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.4

## 0.2.3

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `private: true` so the package is published to npm. Required by `@vertz/cli` at runtime.

- Updated dependencies [[`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b)]:
  - @vertz/compiler@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @vertz/compiler@0.2.2

## 0.2.0

### Minor Changes

- [#323](https://github.com/vertz-dev/vertz/pull/323) [`6814cd8`](https://github.com/vertz-dev/vertz/commit/6814cd8da818cd0b36deaea132ca589cf6a03a89) Thanks [@vertz-tech-lead](https://github.com/apps/vertz-tech-lead)! - Add typed routes, params, and response types in test app. New emit-routes generator in codegen.

### Patch Changes

- Updated dependencies [[`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb)]:
  - @vertz/compiler@0.2.0
