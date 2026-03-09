# @vertz/codegen

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
