# @vertz/compiler

## 0.2.41

## 0.2.40

## 0.2.39

## 0.2.38

## 0.2.37

## 0.2.36

## 0.2.35

## 0.2.34

## 0.2.33

## 0.2.32

## 0.2.31

## 0.2.30

## 0.2.29

## 0.2.28

## 0.2.27

## 0.2.26

## 0.2.25

## 0.2.24

## 0.2.23

## 0.2.22

## 0.2.21

## 0.2.20

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

### Patch Changes

- [#1116](https://github.com/vertz-dev/vertz/pull/1116) [`24b81a2`](https://github.com/vertz-dev/vertz/commit/24b81a26f0064863c1e50cdd17c0fe0fc022f6ea) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `AccessAnalyzer` to extract `defineAccess()` config and `AccessTypesGenerator` to emit typed entitlement unions, making `ctx.can('typo')` a compile error. Add `RlsPolicyGenerator` to generate RLS policies from `rules.where()` conditions. Add `EntitlementRegistry` + `Entitlement` type to `@vertz/server` and `@vertz/ui/auth` for type-safe entitlement narrowing.

- [#1132](https://github.com/vertz-dev/vertz/pull/1132) [`541305e`](https://github.com/vertz-dev/vertz/commit/541305e8f98f2cdcc3bbebd992418680402677fb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat: VertzQL relation queries with where/orderBy/limit support

  Breaking change to EntityRelationsConfig: flat field maps replaced with structured
  RelationConfigObject containing `select`, `allowWhere`, `allowOrderBy`, `maxLimit`.

  - Extended VertzQL include entries to support `where`, `orderBy`, `limit`, nested `include`
  - Recursive include validation with path-prefixed errors and maxLimit clamping
  - Include pass-through from route handler → CRUD pipeline → DB adapter
  - GetOptions added to EntityDbAdapter.get() for include on single-entity fetch
  - Codegen IR and entity schema manifest include allowWhere/allowOrderBy/maxLimit

## 0.2.15

## 0.2.14

### Patch Changes

- [#1089](https://github.com/vertz-dev/vertz/pull/1089) [`3254588`](https://github.com/vertz-dev/vertz/commit/3254588a2cfb3590eebda53a4648256cc4d51139) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Use `vertz` meta-package in scaffolded apps and add missing subpath exports (`db/sqlite`, `ui-server/bun-plugin`, `theme-shadcn`). Compiler now recognizes `vertz/*` imports alongside `@vertz/*`.

## 0.2.13

## 0.2.12

## 0.2.11

## 0.2.8

## 0.2.7

## 0.2.6

## 0.2.5

## 0.2.4

## 0.2.3

### Patch Changes

- [#878](https://github.com/vertz-dev/vertz/pull/878) [`62dddcb`](https://github.com/vertz-dev/vertz/commit/62dddcbcb4943b12a04bca8466b09ae21901070b) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Remove `private: true` so the package is published to npm. Required by `@vertz/cli` and `@vertz/codegen` at runtime.

## 0.2.2

## 0.2.0

### Patch Changes

- [#272](https://github.com/vertz-dev/vertz/pull/272) [`6669f6f`](https://github.com/vertz-dev/vertz/commit/6669f6f73733376816f99c1658803475cf91a5bb) Thanks [@vertz-devops](https://github.com/apps/vertz-devops)! - Replace Dagger with Turborepo for CI pipeline

  Migrate from Dagger to Turborepo for improved reliability, caching, and local/CI parity.

  **Breaking changes:**

  - Removed `codegen` property from `VertzConfig` interface in `@vertz/compiler`. This was an unused configuration option that created a circular dependency. Codegen configuration should be passed directly to codegen functions.

  **Key improvements:**

  - Content-hash-based caching for deterministic builds
  - Identical commands run locally and in CI
  - No external engine dependencies (Dagger was causing instability)
  - Fixed circular dependency between @vertz/compiler and @vertz/codegen by removing type re-exports

  **Migration notes:**

  - `bun run ci` now uses Turborepo instead of Dagger
  - `bun run ci:affected` runs only tasks for packages changed since main
  - All existing package scripts remain unchanged
