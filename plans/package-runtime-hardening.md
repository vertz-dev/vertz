# Design Doc: Package Distribution & Runtime Hardening

**Status:** Draft
**Author:** mike
**Feature:** Package Distribution & Runtime Hardening

## 1. API Surface

This feature is cross-cutting, but it still changes developer-visible behavior in concrete ways.

### 1.1 `vertz/*` subpath imports resolve to built JavaScript

Consumer code stays the same:

```ts
import { createServer } from 'vertz/server';
import { s } from 'vertz/schema';
```

After this change:

- the published `vertz` meta-package points subpath exports at built JS artifacts, not raw `.ts` source files
- Node 22 consumers do not need a TypeScript-aware loader to import `vertz/server`
- types still resolve through the same subpath surface

### 1.2 `@vertz/ui-primitives` barrel imports remain stable but become packaging-safe

Consumer code stays the same:

```ts
import { Tooltip } from '@vertz/ui-primitives';
```

After this change:

- bundlers no longer warn that shared chunks can be dropped incorrectly
- the package metadata matches the actual emitted build structure
- tree-shaking remains effective without relying on unsafe `sideEffects` claims

### 1.3 Scaffold packages participate in the same quality gates as the rest of the repo

Scaffold package behavior stays the same for consumers:

```bash
bunx @vertz/create-vertz-app my-app
```

After this change:

- `@vertz/create-vertz-app` exposes `test` and `typecheck` scripts
- repo-level CI and local phase gates can validate it consistently
- package-local test files are no longer invisible to the standard workflow

### 1.4 Runtime adapter coverage includes Cloudflare

The integration harness gains a first-class Cloudflare runtime target alongside Node, Bun, and Deno.

```bash
RUNTIME=cloudflare bun test packages/integration-tests/src/runtime-adapters
```

After this change:

- `@vertz/cloudflare` is exercised through the same adapter contract as the other runtimes
- `vertz/cloudflare` re-export behavior is covered by runtime-level smoke tests
- runtime adapter drift is caught before release

### 1.5 Auth plan persistence becomes atomic across supported databases

Developer-facing auth API stays the same:

```ts
await planStore.assignPlan('org-1', 'pro');
```

After this change:

- multi-statement auth plan mutations are transactional on PostgreSQL
- the auth layer no longer relies on SQLite-only write serialization assumptions
- failure injection leaves plan state unchanged instead of partially applied

### 1.6 The CLI build pipeline closes the `ui-compiler` integration gap

The developer command stays the same:

```bash
vertz build
```

After this change:

- the UI build stage no longer returns a placeholder success without compiler work
- the CLI and `@vertz/ui-compiler` share a real contract instead of a TODO seam
- component-level build optimizations become available through the first-party build path

## 2. Manifesto Alignment

**Predictability over convenience:** publishing raw `.ts` through `vertz/*` works only in toolchains that quietly transpile dependencies. That is convenient for the repo and unpredictable for users.

**Compile-time over runtime:** package exports, task inputs, and runtime adapter contracts should fail in CI before users discover them in production.

**Explicit over implicit:** `sideEffects`, `exports`, task inputs, and transaction boundaries are packaging contracts. They must describe reality, not optimistic intent.

**LLM-first:** this work reduces invisible seams that agents guess wrong today: whether `vertz/server` is runnable under Node, whether a test file change invalidates Turbo cache, whether `vertz build` actually invokes the UI compiler, and whether runtime adapters are symmetric.

## 3. Non-Goals

- Redesigning the public `vertz` API surface beyond fixing distribution correctness
- Replacing Bun as the primary toolchain for scaffolders or package builds
- Rewriting the full Cloudflare adapter architecture
- Reworking the entire auth subsystem beyond transactional integrity for plan persistence
- General package-docs cleanup for every workspace package in this pass
- Broad UI runtime optimization unrelated to the audited packaging/build gaps

## 4. Unknowns

1. **Cloudflare integration harness shape** — **Needs POC**
   - We need the smallest reliable local runtime for adapter tests.
   - Candidate directions: contract-level worker simulation, Miniflare/workerd-based execution, or a narrower adapter conformance layer.

2. **Transaction surface for auth plan writes** — **Discussion-resolvable, possibly POC**
   - If `DatabaseClient` already exposes enough internals for a safe transaction helper, we should reuse it.
   - If not, we may need a small transaction abstraction at the `@vertz/db` boundary before touching auth stores.

3. **CLI ↔ `ui-compiler` integration boundary** — **Needs POC**
   - The CLI currently delegates the UI stage to Vite.
   - We need to confirm the thinnest compiler invocation that improves correctness/perf without accidentally owning the entire app bundling story in one pass.

## 5. POC Results

### 5.1 CLI `ui-compiler` stage integration POC — Complete

**Question:** What is the thinnest viable compiler contract the CLI should invoke?

**What was tried:** Audited the existing dev pipeline placeholder (`runBuildUI()` no-op), the production build path (`ui-build-pipeline.ts`), the bun plugin's 8-stage transform pipeline, and the raw `compile()` API surface.

**What was learned:** The correct contract is `createVertzBunPlugin()` from `@vertz/ui-server/bun-plugin` — the same one the production build already uses. Calling `compile()` directly is wrong because it skips most of the transform pipeline (hydration, field selection, CSS extraction, etc.). The seam is already closed in production; only the dev pipeline orchestrator has a placeholder. The implementation is a small, well-scoped change: validate plugin construction in dev mode and update pipeline tests.

**Full report:** [plans/poc-cli-ui-compiler-contract.md](./poc-cli-ui-compiler-contract.md)

### 5.2 Cloudflare runtime adapter harness POC — Complete

**Question:** What is the smallest reliable local runtime for Cloudflare adapter tests?

**What was tried:** Evaluated three approaches: (1) contract-level simulation wrapping `createHandler()` from `@vertz/cloudflare` and serving via `Bun.serve` with mock `ExecutionContext`, (2) Miniflare/workerd-based execution in a real Worker process, (3) workerd as a subprocess. Built and ran a validation spike for approach 1.

**What was learned:** Contract-level simulation is the right approach. The `RuntimeAdapter` interface passes function closures, which cannot cross process boundaries — making Miniflare/workerd fundamentally incompatible without rewriting the test architecture. The simulation wraps the handler through `createHandler()`, exercises the full Cloudflare handler pipeline, and requires zero new dependencies. The `RuntimeAdapter` contract needs no changes. Phase 2 can proceed immediately.

**Full report:** [plans/poc-cloudflare-runtime-harness.md](./poc-cloudflare-runtime-harness.md)

## 6. Type Flow Map

This feature is mostly packaging/runtime hardening. It does not introduce a major new public generic surface, but it does create type flow that must be verified end-to-end.

### 6.1 Meta-package subpath typing

```txt
packages/vertz/package.json exports -> dist subpath entry -> dist .d.ts -> consumer import('vertz/server')
```

Acceptance criteria:

- `vertz/server` resolves to built JS at runtime
- `vertz/server` resolves to the correct `.d.ts` surface at typecheck time

### 6.2 Runtime adapter selection

```txt
RUNTIME literal -> runtime-adapters/index.ts -> selected adapter module -> RuntimeAdapter contract -> integration test harness
```

Acceptance criteria:

- adding `cloudflare` extends the adapter union cleanly
- positive and negative coverage exists for runtime selection

### 6.3 Transaction-capable auth DB boundary

```txt
Database transaction surface -> AuthDbClient -> DbPlanStore.assignPlan() -> auth access/session evaluation
```

Acceptance criteria:

- auth plan writes compile against the transaction-capable DB boundary
- failure-path tests prove the boundary reaches the consumer-observable auth result

## 7. E2E Acceptance Tests

1. **Meta-package runtime:** in a clean Node 22 project, `import { createServer } from 'vertz/server'` runs without a TypeScript loader.
2. **Meta-package typing:** a `.test-d.ts` or integration typecheck proves `vertz/server`, `vertz/schema`, and `vertz/cloudflare` expose the same public types as the underlying packages.
3. **Turbo correctness:** changing only a test outside `src/` invalidates the cached `test` task and reruns the package tests.
4. **Scaffolder gates:** `@vertz/create-vertz-app` participates in repo-level `test` and `typecheck` workflows.
5. **Cloudflare runtime:** the integration runtime harness can boot a Vertz handler through the Cloudflare adapter and serve a request successfully.
6. **UI package metadata:** a single-import bundle of `@vertz/ui-primitives` completes without ignored-bare-import side-effect warnings.
7. **Auth integrity:** when a forced failure occurs mid-plan-assignment on PostgreSQL, the tenant’s plan/override state remains atomic.
8. **CLI integration:** `vertz build` exercises a real `ui-compiler` stage instead of returning a placeholder success.

## 8. Review Sign-Offs Needed

- **DX:** josh reviews the consumer-facing package/import behavior and CLI/build ergonomics.
- **Product/Scope:** pm reviews the scope split, especially the decision to keep this narrowly on audited hardening items.
- **Technical Feasibility:** one engineer reviews the transaction boundary, Cloudflare harness, and packaging/build changes.
