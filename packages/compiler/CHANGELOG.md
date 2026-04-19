# @vertz/compiler

## 0.2.73

## 0.2.72

### Patch Changes

- [#2774](https://github.com/vertz-dev/vertz/pull/2774) [`8493aee`](https://github.com/vertz-dev/vertz/commit/8493aee0c1157a2a0f78b2579e29e1fbd70e629e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(codegen): generate typed SDK for services (#2759)

  `vtz codegen` now emits fully typed SDKs for `service()` definitions, not just
  entities. The compiler walks `action({ body, response })` schemas via the
  `SchemaLike<T>.parse()` contract and surfaces the resolved field shapes on
  the IR. The codegen pipeline then emits:

  - `types/services/{name}.ts` — `${ActionPascal}${ServicePascal}Input` /
    `Output` interfaces with TS_TYPE_MAP (date → string for JSON transport).
  - `services/{name}.ts` — SDK with `(body: InputType)` signatures and
    `client.<method><OutputType>()` calls. Falls back to `unknown` when a
    schema can't be resolved.

  Callers like `api.ai.parse({ projectId, message })` now get full compile-time
  type safety, preserving SSR integration, caching, and optimistic updates
  without falling back to raw `fetch()`.

  Also includes a deny-by-default access filter: service actions with no
  `access` entry resolved to `'function'` are now excluded from generated
  SDKs (previously they leaked through).

## 0.2.71

## 0.2.70

## 0.2.69

## 0.2.68

## 0.2.67

## 0.2.66

## 0.2.65

## 0.2.64

## 0.2.63

## 0.2.62

## 0.2.61

## 0.2.60

## 0.2.59

## 0.2.58

## 0.2.57

## 0.2.56

## 0.2.55

## 0.2.54

## 0.2.53

## 0.2.52

### Patch Changes

- [#2398](https://github.com/vertz-dev/vertz/pull/2398) [`a350ab7`](https://github.com/vertz-dev/vertz/commit/a350ab7c97705b74e8309f23bb06a43a6530fd39) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Generate type-safe query parameters for SDK list/get methods. Entities with expose config get typed WhereInput, OrderByInput, IncludeInput, ListQuery, and GetQuery interfaces. Entities without expose fall back to VertzQLParams.

## 0.2.51

## 0.2.50

## 0.2.49

## 0.2.48

## 0.2.47

## 0.2.46

## 0.2.45

## 0.2.44

## 0.2.43

## 0.2.42

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
