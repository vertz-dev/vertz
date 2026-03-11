# Package Distribution & Runtime Hardening — Implementation Plan

**Design doc:** [plans/package-runtime-hardening.md](./package-runtime-hardening.md)
**Package focus:** `vertz`, `@vertz/ui-primitives`, `@vertz/create-vertz-app`, `@vertz/cloudflare`, `@vertz/integration-tests`, `@vertz/server`, `@vertz/db`, `@vertz/cli`

---

## Architecture Decisions

| Area | Decision | Why |
|---|---|---|
| Meta-package exports | `vertz/*` points at built `dist/**` JS and `.d.ts`, not source `.ts` | Published packages must run under standard Node resolution |
| Task invalidation | Turbo task inputs include `src/**`, `tests/**`, `__tests__/**`, `bin/**`, and other package-local executable inputs | CI/cache correctness is more important than overly optimistic cache hits |
| Scaffold package gates | `@vertz/create-vertz-app` exposes `build`, `test`, and `typecheck` like other published packages | Prevents silent CI blind spots |
| Runtime coverage | Cloudflare uses the shared `RuntimeAdapter` contract instead of bespoke one-off tests | Keeps runtime parity visible in one place |
| Auth integrity | Multi-statement auth plan writes require a transaction-capable DB boundary before server changes land | Prevents partial writes on PostgreSQL |
| UI build integration | CLI `build-ui` stage should call a real `@vertz/ui-compiler` contract, not own bundling outright | Closes the seam without over-scoping the phase |

---

## Dependency Map

```txt
Phase 1: Release correctness foundation
  |
  +--> Phase 2: Runtime adapter coverage
  |
  +--> Phase 3: Auth/Postgres integrity
  |
  '--> Phase 4: UI packaging + CLI compiler integration
```

- **Phase 1** is the first vertical slice and the hard prerequisite for the others.
- **Phase 2** depends on Phase 1 because the meta-package/runtime contract must be stable first.
- **Phase 3** can start after Phase 1.
- **Phase 4** can start after Phase 1 and the CLI integration POC.

---

## Phase 1: Release Correctness Foundation

**Goal:** make published packages and repo gates truthful before deeper runtime work.

**What it implements**

- move `vertz/*` exports to built artifacts
- add build output and typecheck coverage for the `vertz` meta-package
- expand Turbo task inputs so test-only changes invalidate cache
- add `test` and `typecheck` scripts to `@vertz/create-vertz-app`

### Files

- `packages/vertz/package.json`
- `packages/vertz/tsconfig.json`
- `packages/vertz/__tests__/subpath-exports.test.ts`
- `packages/vertz/src/*.ts`
- `packages/create-vertz-app/package.json`
- `packages/create-vertz-app/src/__tests__/*`
- `turbo.json`

### TDD cycles

1. **RED:** Node consumer import of `vertz/server` fails because exports point to `.ts`
   **GREEN:** build `vertz` subpath artifacts and update exports to `dist/**`

2. **RED:** `vertz` subpath type surface drifts from the underlying packages
   **GREEN:** add type-level smoke coverage for representative subpaths

3. **RED:** changing `packages/cloudflare/tests/handler.test.ts` or `packages/vertz/__tests__/subpath-exports.test.ts` does not invalidate Turbo `test`
   **GREEN:** widen Turbo `test` inputs

4. **RED:** `@vertz/create-vertz-app` cannot run standard `test` / `typecheck`
   **GREEN:** add scripts and wire them into package validation

### Integration acceptance

- Integration test: Node 22 runs a minimal `vertz/server` consumer without TS loader hacks
- Type integration: `vertz/server`, `vertz/schema`, and `vertz/cloudflare` resolve through typecheck
- Cache correctness test: editing an out-of-`src` test file causes the package `test` task to rerun
- Package gate: `cd packages/create-vertz-app && bun run test && bun run typecheck` succeeds

### Phase gate

- `bun test packages/vertz/__tests__/subpath-exports.test.ts`
- `cd packages/create-vertz-app && bun run test`
- `cd packages/create-vertz-app && bun run typecheck`
- `bun run --filter vertz test`
- `bunx biome check packages/vertz packages/create-vertz-app turbo.json`

### Review artifact

- `reviews/package-runtime-hardening/phase-01-release-correctness.md`

---

## Phase 2: Runtime Adapter Coverage

**Goal:** validate that supported runtime surfaces are actually symmetric.

**What it implements**

- add a Cloudflare runtime adapter to the integration harness
- add runtime smoke tests for `@vertz/cloudflare` and `vertz/cloudflare`
- ensure runtime selection rejects unsupported values cleanly

### Files

- `packages/integration-tests/src/runtime-adapters/index.ts`
- `packages/integration-tests/src/runtime-adapters/cloudflare.ts`
- `packages/integration-tests/src/runtime-adapters/cloudflare.test.ts`
- `packages/integration-tests/src/runtime-adapters/types.ts`
- `packages/integration-tests/package.json`
- `packages/cloudflare/tests/handler.test.ts`
- `packages/vertz/__tests__/subpath-exports.test.ts`

### TDD cycles

1. **RED:** `RUNTIME=cloudflare` is rejected as unknown
   **GREEN:** add `cloudflare` to the adapter map and contract

2. **RED:** Cloudflare adapter can compile but not satisfy the shared runtime harness
   **GREEN:** implement the thinnest compliant adapter/harness

3. **RED:** `vertz/cloudflare` re-export path is not exercised in runtime tests
   **GREEN:** add smoke coverage through the meta-package surface

4. **RED:** unsupported runtime values fail unclearly
   **GREEN:** tighten error expectations and coverage

### Integration acceptance

- Integration test: Cloudflare adapter serves a request through the shared runtime contract
- Integration test: `vertz/cloudflare` matches `@vertz/cloudflare` at runtime
- Integration test: invalid `RUNTIME` values fail with an explicit error

### Phase gate

- `bun test packages/integration-tests/src/runtime-adapters`
- `bun test packages/cloudflare/tests/handler.test.ts`
- `bun test packages/vertz/__tests__/subpath-exports.test.ts`
- `bun run --filter @vertz/integration-tests typecheck`
- `bunx biome check packages/integration-tests/src/runtime-adapters packages/cloudflare/tests`

### Review artifact

- `reviews/package-runtime-hardening/phase-02-runtime-adapters.md`

---

## Phase 3: Auth/Postgres Integrity

**Goal:** remove the known transactional correctness gap in auth plan writes.

**What it implements**

- introduce or expose a transaction-capable DB boundary for auth plan operations
- update `AuthDbClient` / `DbPlanStore` to perform plan + override changes atomically
- close the SQLite-only assumption in auth plan persistence
- add failure-injection tests for PostgreSQL behavior

### Files

- `packages/db/src/core/db-provider.ts`
- `packages/db/src/client/*`
- `packages/server/src/auth/db-types.ts`
- `packages/server/src/auth/db-plan-store.ts`
- `packages/server/src/auth/__tests__/plan-store.test.ts`
- `packages/server/src/auth/__tests__/shared-plan-store.tests.ts`
- `packages/integration-tests/src/**/auth-*.test.ts`

### TDD cycles

1. **RED:** forced failure between plan upsert and override clear leaves partially applied auth state
   **GREEN:** wrap the write path in a transaction

2. **RED:** PostgreSQL auth path cannot access the required transaction surface
   **GREEN:** expose the minimal transaction boundary from `@vertz/db`

3. **RED:** rollback path still leaks intermediate changes
   **GREEN:** add rollback coverage and tighten store behavior

4. **RED:** type-level auth DB contract does not flow through updated store surface
   **GREEN:** add type regression coverage for the new boundary

### Integration acceptance

- Integration test: PostgreSQL failure injection rolls back plan + override mutation
- Integration test: successful plan change still clears overrides as designed
- Type test: transaction-capable auth DB surface compiles end-to-end

### Phase gate

- `bun test packages/server/src/auth/__tests__/plan-store.test.ts`
- `bun test packages/server/src/auth/__tests__/shared-plan-store.tests.ts`
- `bun run --filter @vertz/server typecheck`
- `bun run --filter @vertz/db typecheck`
- `bunx biome check packages/server/src/auth packages/db/src`

### Review artifact

- `reviews/package-runtime-hardening/phase-03-auth-postgres-integrity.md`

---

## Phase 4: UI Packaging + CLI Compiler Integration

**Goal:** close the remaining performance and integration seams exposed by the audit.

**What it implements**

- make `@vertz/ui-primitives` metadata match its emitted shared-chunk build
- add tree-shaking regression coverage for the package metadata choice
- replace the CLI `build-ui` placeholder with real `@vertz/ui-server/bun-plugin` contract (see [POC results](./poc-cli-ui-compiler-contract.md))

### Files

- `packages/ui-primitives/package.json`
- `packages/ui-primitives/bunup.config.ts`
- `packages/ui-primitives/src/__tests__/*`
- `tests/tree-shaking/tree-shaking.test.ts`
- `packages/cli/src/pipeline/orchestrator.ts`
- `packages/cli/src/pipeline/__tests__/*`

### TDD cycles

1. **RED:** tree-shaking regression test emits ignored-bare-import warnings for `@vertz/ui-primitives`
   **GREEN:** align build output and `sideEffects` metadata

2. **RED:** importing a single primitive regresses bundle ratio after metadata fix
   **GREEN:** preserve the existing bundle-size thresholds while removing unsafe warnings

3. **RED:** CLI `build-ui` stage reports success without invoking compiler work
   **GREEN:** wire the `createVertzBunPlugin` contract from `@vertz/ui-server/bun-plugin` into the stage

4. **RED:** CLI pipeline tests still accept placeholder behavior
   **GREEN:** update pipeline assertions to require real compiler interaction

### Integration acceptance

- Tree-shaking test: `@vertz/ui-primitives` single-import bundle passes without ignored-bare-import warnings
- CLI integration test: `build-ui` fails when compiler work fails and succeeds when compiler output is produced
- Cross-package test: CLI uses `@vertz/ui-server/bun-plugin` through a stable contract

### Phase gate

- `bun run test:tree-shaking`
- `bun test packages/cli/src/pipeline`
- `bun run --filter @vertz/cli typecheck`
- `bun run --filter @vertz/ui-primitives typecheck`
- `bunx biome check packages/cli/src/pipeline packages/ui-primitives`

### Review artifact

- `reviews/package-runtime-hardening/phase-04-ui-packaging-and-cli.md`

---

## Developer Walkthrough

Write this walkthrough as a failing integration spec in Phase 1 and keep it green through all later phases.

1. Start from a clean Node 22 project.
2. Install `vertz`.
3. Create `server.mjs` with `import { createServer } from 'vertz/server'` and a minimal schema import from `vertz/schema`.
4. Run the file with Node and confirm the import surface works without a TS loader.
5. In a minimal UI app, import `Tooltip` from `@vertz/ui-primitives`, build the app, and confirm the bundle completes without ignored-bare-import warnings.
6. In the repo, run the runtime adapter suite with `RUNTIME=cloudflare` and confirm a request succeeds through the Cloudflare adapter path.
7. In an auth integration test against PostgreSQL, simulate a mid-transaction failure and confirm the tenant plan state remains unchanged.
8. Run `vertz build` and confirm the UI stage performs real compiler work rather than returning a placeholder success.

---

## Phase Review Rules

- After each phase, run the full required gates for the changed packages plus any integration tests listed above.
- A different bot reviews the phase and writes the corresponding file under `reviews/package-runtime-hardening/`.
- If a phase reveals a design deviation:
  - public package/import behavior changes -> josh re-approves
  - scope/timeline expands materially -> pm re-approves
  - internal-only implementation detail -> mike decides whether the design doc needs updating

---

## Suggested Execution Order

1. Finish Phase 1 first. It gives immediate end-to-end value and makes later validation trustworthy.
2. Run the Cloudflare and CLI POCs before Phase 2 / Phase 4.
3. Execute Phases 2 and 3 in parallel if bandwidth allows.
4. Finish with Phase 4 once packaging and runtime correctness are stable.
