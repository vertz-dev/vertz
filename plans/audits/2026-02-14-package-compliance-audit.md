# Package Compliance Audit — Definition of Done
**Date:** 2026-02-14  
**Auditor:** auditor (subagent)  
**Scope:** 15 published packages in `/workspace/vertz/packages/`  
**Criteria Source:** `/workspace/vertz/.claude/rules/definition-of-done.md`

---

## Executive Summary

**Critical Findings:**
- **13 of 15 packages lack READMEs** (only `ui` and `ui-server` have them)
- **0 of 15 packages have examples/** directories
- **All packages' tests use internal imports** (relative `../` imports from src/)
- **8 of 15 packages have type tests** (`.test-d.ts`)
- **2 packages lack `package.json`** entirely (`canvas`, `create-vertz-app`)

**Overall Assessment:**  
The packages fail the "Developer Walkthrough" gate comprehensively. While many packages have solid internal implementations and good test coverage, they are **not consumable** by external developers. The "5-minute rule" fails for all but 2 packages due to missing documentation.

---

## Audit Criteria

From `definition-of-done.md` → **Feature Done** section:

1. **Developer Walkthrough** — Can a developer use each package's features with only the public API and docs? Is there a clear step-by-step consumption guide? The "5-minute rule": can someone go from zero to working in 5 minutes with just the docs?
2. **Examples use only the public API** — No internal imports, no custom glue code, no non-standard dev commands.
3. **README quality** — Does each package have a README with clear usage instructions?
4. **Type flow verification** — Are generic type parameters tested end-to-end?
5. **Changeset coverage** — Have changes been properly documented?

---

## Package Scorecards

### 1. @vertz/canvas

**Status:** ❌ **NOT PUBLISHABLE**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | Package directory only contains `node_modules/` |
| Examples (Public API) | ❌ | No examples, no tests, no source code |
| README | ❌ | No README |
| Type Flow Verification | ❌ | No tests at all |
| Changeset Coverage | ❌ | No `package.json` to version |

**What's Missing:**
- Package has no `package.json`
- No `src/` directory
- No tests, no documentation, no exports
- Appears to be a placeholder or abandoned package

**Priority:** **P0** — This package should either be removed from the monorepo or properly scaffolded.

**Recommendation:** Remove from published packages list or complete initial implementation.

---

### 2. @vertz/cli

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README — cannot be consumed without reading source |
| Examples (Public API) | ❌ | No examples directory; tests use internal `../` imports |
| README | ❌ | No README |
| Type Flow Verification | ⚠️ | Has tests but no `.test-d.ts` for generic types |
| Changeset Coverage | ✅ | Changesets present at repo level |

**What's Missing:**
- **README** with installation, basic usage, API reference
- **Examples** showing how to create a CLI, add commands, use the dev server
- **Type tests** for generic parameters in `CLIConfig`, `GeneratorDefinition`, etc.
- Tests currently import from `../` (internal) instead of `@vertz/cli` (public API)

**Priority:**
- README + basic usage example: **P0** (blocks consumption)
- Type tests for generics: **P1** (significant gap)
- Refactor tests to use public API: **P2** (nice to have, less critical for CLI tools)

**Notes:**  
The CLI is a critical entry point to the framework. Without a README, developers cannot discover or use it. The package exports a rich public API (`createCLI`, `buildAction`, `createDevLoop`, etc.) but provides no guidance on how to compose these pieces.

---

### 3. @vertz/cli-runtime

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** explaining what cli-runtime is, when to use it vs `@vertz/cli`
- **Examples** showing how to create a CLI runtime, define commands, handle auth
- **Type tests** for generic types in `CLIRuntime`, `CommandDefinition`, `ParameterResolver`

**Priority:**
- README: **P0**
- Examples: **P1**
- Type tests: **P1**

---

### 4. @vertz/codegen

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** with usage instructions, configuration examples
- **Examples** showing how to set up codegen, configure generators, emit SDK/CLI code
- **Type tests** for generic types in config resolution

**Priority:**
- README: **P0** (critical — codegen is a core developer-facing tool)
- Examples: **P1**
- Type tests: **P1**

**Notes:**  
Codegen is a foundational tool that generates SDK/CLI code from schemas. Without documentation, developers cannot configure or extend it.

---

### 5. @vertz/compiler

**Status:** ⚠️ **SIGNIFICANT GAPS**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ✅ | Has `.test-d.ts` files for IR types, generators |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** explaining the compiler architecture, how to use analyzers, how to extend it
- **Examples** showing how to use `AppAnalyzer`, `ModuleAnalyzer`, etc.

**Priority:**
- README: **P1** (compiler is typically not directly consumed by end users, more of an internal tool)
- Examples: **P2**

**Notes:**  
The compiler has good type tests (IR types, generator inference). It's primarily an internal package consumed by CLI/codegen, so the lack of README is less critical for external developers, but still important for contributors and advanced users.

---

### 6. @vertz/core

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ✅ | Has `.test-d.ts` for middleware context inference, inject type flow, router type inference |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** — this is the CORE package! Needs installation, "Hello World" app, routing, middleware, DI examples
- **Examples** showing:
  - Creating an app with `createApp()`
  - Defining modules with routes, services, middleware
  - Using dependency injection
  - Request/response handling
  - Exception handling

**Priority:**
- README + basic app example: **P0** (absolutely critical — this is the framework's heart)
- Comprehensive examples: **P1**

**Notes:**  
`@vertz/core` is the main framework package. The lack of a README is a **showstopper** for external adoption. The package exports a rich API (`createApp`, `createModule`, `createMiddleware`, etc.) with excellent type inference (proven by `.test-d.ts` files), but provides zero guidance on how to use it.

**5-Minute Rule:** ❌ FAIL — A developer cannot even install and run "Hello World" without reading source code.

---

### 7. @vertz/create-vertz-app

**Status:** ❌ **NOT PUBLISHABLE**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README, no `package.json` |
| Examples (Public API) | ⚠️ | Has tests, but no examples |
| README | ❌ | No README |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ❌ | No `package.json` to version |

**What's Missing:**
- **`package.json`** — the package is not properly configured for publishing
- **README** explaining how to use the scaffolding tool
- **Type tests** for prompt types, template types

**Priority:** **P0** — This is the primary onboarding tool. It MUST work and MUST have a README.

**Notes:**  
This is the first package developers interact with (`npm create vertz-app`). The absence of `package.json` suggests the package is incomplete or misconfigured. The source exists (`src/index.ts` exports `prompts.js`, `scaffold.js`, `templates/`), but the package is not ready for publishing.

---

### 8. @vertz/db

**Status:** ⚠️ **SIGNIFICANT GAPS**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ✅ | Extensive `.test-d.ts` coverage (column, table, registry, relation, inference) |
| Changeset Coverage | ✅ | Changesets present (including `db-v1-initial.md`) |

**What's Missing:**
- **README** with:
  - Installation
  - Schema definition (`table`, `column`, etc.)
  - Query building (CRUD, aggregates, relations)
  - Migrations (`migrateDev`, `migrateDeploy`, `push`)
  - Plugin system
- **Examples** showing common patterns (define schema, run queries, migrations, plugins)

**Priority:**
- README + basic usage: **P0** (DB is a core framework feature)
- Examples: **P1**

**Notes:**  
The DB package has **excellent type inference** (proven by 8 `.test-d.ts` files) and comprehensive changesets. However, without a README, developers cannot use it. The public API is extensive (`createDb`, `migrateDev`, `push`, query builders, etc.) but undocumented.

**5-Minute Rule:** ❌ FAIL — Cannot define a schema or run a query without reading source.

---

### 9. @vertz/fetch

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** explaining `FetchClient`, retry logic, error handling, streaming, auth strategies
- **Examples** showing:
  - Creating a client
  - Making requests (GET, POST, etc.)
  - Error handling
  - Streaming responses
  - Custom auth strategies

**Priority:**
- README: **P0**
- Examples: **P1**
- Type tests for generic types: **P1**

**Notes:**  
Fetch is a common use case. The package exports `FetchClient` with rich configuration options, but no documentation on how to use them.

---

### 10. @vertz/primitives

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README (but IS documented in `@vertz/ui` README) |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README in this package |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** in the package itself (or at minimum a reference to `@vertz/ui` docs)
- **Examples** showing how to use each primitive (Button, Dialog, Menu, etc.)
- **Type tests** for generic state types

**Priority:**
- README or docs link: **P1** (partially mitigated by `@vertz/ui` README mentioning primitives)
- Examples: **P1**
- Type tests: **P2**

**Notes:**  
The `@vertz/ui` README includes a "Primitives" section with a brief overview and one example (`Button.Root`). However, the `@vertz/primitives` package itself has no README. A developer discovering the package on npm would have no guidance on how to use it.

**Recommendation:** Add a README to `@vertz/primitives` that either duplicates the primitives section from `@vertz/ui` or links to it prominently.

---

### 11. @vertz/schema

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ✅ | Has `.test-d.ts` for type inference, object types, composite types, format string methods |
| Changeset Coverage | ✅ | Changesets present (`format-schema-methods.md`) |

**What's Missing:**
- **README** with:
  - Installation
  - Basic usage (`s.string()`, `s.number()`, `s.object()`, etc.)
  - Validation (`parse()`, `safeParse()`)
  - Transformations, refinements, branding
  - JSON Schema generation
- **Examples** showing common patterns (form validation, API schemas, etc.)

**Priority:**
- README: **P0** (schema validation is a core framework feature)
- Examples: **P1**

**Notes:**  
The schema package has **excellent type tests** and a rich public API (`s.string()`, `s.object()`, effects, formats, etc.). However, without a README, developers cannot use it. The package appears to be similar to Zod — developers need clear migration/comparison guidance.

**5-Minute Rule:** ❌ FAIL — Cannot define and validate a schema without reading source.

---

### 12. @vertz/testing

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README |
| Type Flow Verification | ✅ | Has `.test-d.ts` for `TestApp` |
| Changeset Coverage | ✅ | Changesets present |

**What's Missing:**
- **README** explaining `createTestApp()`, `createTestService()`, how to write tests for vertz apps
- **Examples** showing:
  - Testing routes
  - Testing services
  - Mocking dependencies
  - Testing middleware

**Priority:**
- README: **P0** (testing utilities are critical for developer onboarding)
- Examples: **P1**

**Notes:**  
Testing is essential for any framework. The package exports `createTestApp()` and `createTestService()` with good type inference, but no documentation on how to use them.

---

### 13. @vertz/ui

**Status:** ✅ **GOOD** (with minor gaps)

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ✅ | Comprehensive README with clear usage instructions |
| Examples (Public API) | ⚠️ | README has inline examples, but no `examples/` directory; tests use internal imports |
| README | ✅ | Excellent README (27KB, well-structured) |
| Type Flow Verification | ✅ | Has `.test-d.ts` for signal, router, query, context, CSS, form |
| Changeset Coverage | ✅ | Changesets present (multiple UI-related changesets) |

**What's Missing:**
- **Dedicated examples/** directory with standalone projects
- **Tests** currently use internal `../` imports instead of `@vertz/ui` imports

**Priority:**
- Examples directory: **P1** (README examples are good, but standalone projects would help)
- Refactor tests to use public API: **P2**

**Notes:**  
This is the **gold standard** for the monorepo. The README covers:
- Quick start with Vite
- Reactivity model (`let`, `const`, JSX)
- Components, props, children
- Conditional rendering, list rendering
- Styling (`css()`, `variants()`, `globalCss()`, theming)
- Data fetching (`query()`)
- Routing
- Forms
- Lifecycle hooks
- Primitives overview
- When to use `effect()`

**5-Minute Rule:** ✅ PASS — A developer can copy the Quick Start section and have a working app in under 5 minutes.

**Recommendation:** Create an `examples/` directory with small projects (counter, todo list, data fetching, routing) that can be run standalone.

---

### 14. @vertz/ui-compiler

**Status:** ⚠️ **BLOCKS EXTERNAL CONSUMPTION**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ❌ | No README (but usage IS shown in `@vertz/ui` README) |
| Examples (Public API) | ❌ | No examples; tests use internal imports |
| README | ❌ | No README in this package |
| Type Flow Verification | ✅ | Has `.test-d.ts` for theme types |
| Changeset Coverage | ✅ | Changesets present (`ui-018-compiletheme-export.md`) |

**What's Missing:**
- **README** explaining the compiler, Vite plugin options, how to extend it
- **Examples** showing custom transformer configuration, diagnostic handling

**Priority:**
- README: **P1** (usage is documented in `@vertz/ui` README, so less critical)
- Examples: **P2**

**Notes:**  
The `@vertz/ui` README includes a "Vite Config" section showing how to use the compiler plugin:
```ts
import vertz from '@vertz/ui-compiler/vite';
export default defineConfig({ plugins: [vertz()] });
```

However, the `@vertz/ui-compiler` package itself has no README. Advanced use cases (custom include/exclude, CSS extraction config) are not documented.

**Recommendation:** Add a README to `@vertz/ui-compiler` covering plugin options, diagnostics, and extension points.

---

### 15. @vertz/ui-server

**Status:** ✅ **GOOD**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Developer Walkthrough | ✅ | Comprehensive README (10KB) |
| Examples (Public API) | ⚠️ | README has inline examples, no `examples/` directory; tests use internal imports |
| README | ✅ | Good README covering all major features |
| Type Flow Verification | ⚠️ | No `.test-d.ts` |
| Changeset Coverage | ✅ | Changesets present (`ssr-zero-config.md`, `suspense-error-propagation.md`) |

**What's Missing:**
- **Dedicated examples/** directory
- **Type tests** for generic types (VNode, SSR helpers)

**Priority:**
- Examples directory: **P1**
- Type tests: **P1** (important for VNode type safety)

**Notes:**  
The README covers:
- Streaming HTML with `renderToStream()`
- Out-of-order Suspense streaming
- Hydration markers
- Head management
- Asset injection
- Critical CSS inlining
- CSP nonce support
- Full API reference with types

**5-Minute Rule:** ✅ PASS — A developer can follow the "Basic SSR" example and get server-side rendering working quickly.

**Recommendation:** Add type tests for VNode construction, hydration options, and SSR streaming types.

---

## Summary Matrix

| Package | README | Examples | Public API Tests | Type Tests | Overall |
|---------|--------|----------|------------------|------------|---------|
| canvas | ❌ | ❌ | ❌ | ❌ | ❌ NOT PUBLISHABLE |
| cli | ❌ | ❌ | ❌ | ⚠️ | ❌ BLOCKS CONSUMPTION |
| cli-runtime | ❌ | ❌ | ❌ | ⚠️ | ❌ BLOCKS CONSUMPTION |
| codegen | ❌ | ❌ | ❌ | ⚠️ | ❌ BLOCKS CONSUMPTION |
| compiler | ❌ | ❌ | ❌ | ✅ | ⚠️ SIGNIFICANT GAPS |
| core | ❌ | ❌ | ❌ | ✅ | ❌ BLOCKS CONSUMPTION |
| create-vertz-app | ❌ | ❌ | ❌ | ⚠️ | ❌ NOT PUBLISHABLE |
| db | ❌ | ❌ | ❌ | ✅ | ⚠️ SIGNIFICANT GAPS |
| fetch | ❌ | ❌ | ❌ | ⚠️ | ❌ BLOCKS CONSUMPTION |
| primitives | ❌ | ❌ | ❌ | ⚠️ | ⚠️ SIGNIFICANT GAPS |
| schema | ❌ | ❌ | ❌ | ✅ | ❌ BLOCKS CONSUMPTION |
| testing | ❌ | ❌ | ❌ | ✅ | ❌ BLOCKS CONSUMPTION |
| ui | ✅ | ⚠️ | ❌ | ✅ | ✅ GOOD |
| ui-compiler | ❌ | ❌ | ❌ | ✅ | ⚠️ SIGNIFICANT GAPS |
| ui-server | ✅ | ⚠️ | ❌ | ⚠️ | ✅ GOOD |

---

## Priority Breakdown

### P0 — Blocks External Consumption (Must Fix Before Public Release)

These packages **cannot be consumed** by external developers without reading source code:

1. **@vertz/core** — Add README with "Hello World" app, routing, middleware examples
2. **@vertz/db** — Add README with schema definition, queries, migrations
3. **@vertz/schema** — Add README with validation, transformations, refinements
4. **@vertz/cli** — Add README with CLI creation, commands, dev server usage
5. **@vertz/fetch** — Add README with client creation, requests, error handling
6. **@vertz/codegen** — Add README with config, generators, SDK/CLI emission
7. **@vertz/testing** — Add README with `createTestApp()`, `createTestService()` usage
8. **@vertz/cli-runtime** — Add README explaining cli-runtime vs cli
9. **@vertz/canvas** — Remove or properly scaffold
10. **@vertz/create-vertz-app** — Add `package.json`, README

### P1 — Significant Gaps (High Priority)

1. **All packages:** Create `examples/` directories with standalone projects
2. **@vertz/compiler** — Add README (less critical since it's mostly internal)
3. **@vertz/primitives** — Add README or prominent link to `@vertz/ui` docs
4. **@vertz/ui-compiler** — Add README with plugin options
5. **Packages without type tests:** Add `.test-d.ts` files (fetch, cli, cli-runtime, codegen, primitives, ui-server)
6. **@vertz/ui**, **@vertz/ui-server** — Add standalone examples

### P2 — Nice to Have (Lower Priority)

1. **All packages:** Refactor tests to use public API imports instead of internal `../` imports
2. **@vertz/compiler** — Add examples (low priority, mostly internal)

---

## Changeset Coverage Analysis

**Status:** ✅ **GOOD**

The `.changeset` directory at repo root contains 15+ changesets covering recent work:
- `db-v1-initial.md` (major)
- `dts-type-preservation.md` (patch)
- `fix-muxing-shell-injection.md` (patch)
- `format-schema-methods.md` (minor)
- `inject-type-flow.md` (minor)
- `minimax-tts-integration.md` (minor)
- `postgres-driver.md` (patch)
- `ssr-zero-config.md` (minor)
- `startup-route-log.md` (patch)
- `suspense-error-propagation.md` (patch)
- `turborepo-migration.md` (patch)
- `ui-016-oncleanup-noop.md` (patch)
- `ui-017-globalcss-inject.md` (patch)
- `ui-018-compiletheme-export.md` (patch)
- `ui-019-conditional-disposal.md` (patch)

Changesets are being written consistently for package changes. ✅

---

## Tests Using Internal Imports

**Status:** ❌ **ALL PACKAGES AFFECTED**

All package tests import from internal source files using relative paths (`../`, `../../`) instead of the public package API:

**Example from `@vertz/ui`:**
```ts
import { batch } from '../scheduler';
import { computed, effect, signal } from '../signal';
import { untrack } from '../tracking';
```

**Should be:**
```ts
import { batch, computed, effect, signal, untrack } from '@vertz/ui';
```

**Impact:**  
Tests do not verify that the public API is usable. A function could be implemented but not exported, and tests would still pass.

**Note on Test vs. Example distinction:**  
The Definition of Done says "Examples use only the public API." The packages have **tests** (unit tests for internals) but no **examples** (consumption guides). This is a gray area:

- **Unit tests** for internals (e.g., testing `signal()` implementation details) appropriately use internal imports.
- **Integration tests** and **examples** MUST use the public API.

Currently, there are NO integration tests or examples that use the public API. This is a gap.

**Recommendation:**  
- Keep unit tests as-is (internal imports are fine for testing implementation details)
- Add `examples/` directories with standalone projects that import from the public package names
- Add integration tests in `integration-tests/` (already exists at repo level) that use public APIs

---

## Type Flow Verification

**Packages WITH `.test-d.ts` (8):** ✅
- `@vertz/db` — Extensive (8 files: column, table, registry, relation, inference, metadata, database types, type errors)
- `@vertz/schema` — Good (4 files: infer types, format string methods, object types, composite types, schema types)
- `@vertz/ui` — Excellent (7 files: signal, router, query, context, CSS, form variants)
- `@vertz/compiler` — Good (6 files: IR types, incremental, boot generator, schema registry, route table, manifest)
- `@vertz/core` — Good (3 files: middleware ctx inference, inject type flow, router type inference)
- `@vertz/testing` — Minimal (1 file: test-app)
- `@vertz/ui-compiler` — Minimal (1 file: theme types)

**Packages WITHOUT `.test-d.ts` (7):** ❌
- `@vertz/canvas` (no code at all)
- `@vertz/cli`
- `@vertz/cli-runtime`
- `@vertz/codegen`
- `@vertz/create-vertz-app`
- `@vertz/fetch`
- `@vertz/primitives`
- `@vertz/ui-server`

**Assessment:**  
Packages with complex generic types (db, schema, ui, compiler, core) have good type test coverage. However, several packages with generic APIs (fetch, codegen, primitives, ui-server) lack type tests.

**Recommendation:**  
Add `.test-d.ts` files for:
- `@vertz/fetch` — Test `FetchClient<T>`, `FetchResponse<T>`, `StreamingRequestOptions<T>`
- `@vertz/codegen` — Test generic config resolution types
- `@vertz/primitives` — Test component state types (e.g., `ComboboxState`, `DialogState`)
- `@vertz/ui-server` — Test `VNode` construction, `renderToStream()` with different types

---

## The "5-Minute Rule" Assessment

**Question:** Can a developer go from zero to working in 5 minutes with just the docs?

| Package | 5-Minute Rule | Notes |
|---------|---------------|-------|
| canvas | ❌ FAIL | No docs, no code |
| cli | ❌ FAIL | No README |
| cli-runtime | ❌ FAIL | No README |
| codegen | ❌ FAIL | No README |
| compiler | ❌ FAIL | No README |
| core | ❌ FAIL | No README — **CRITICAL** (this is the main framework) |
| create-vertz-app | ❌ FAIL | No package.json, no README |
| db | ❌ FAIL | No README |
| fetch | ❌ FAIL | No README |
| primitives | ⚠️ PARTIAL | Documented in `@vertz/ui` README, but not in package itself |
| schema | ❌ FAIL | No README |
| testing | ❌ FAIL | No README |
| ui | ✅ PASS | Excellent README, clear quick start |
| ui-compiler | ⚠️ PARTIAL | Usage shown in `@vertz/ui` README, but not in package |
| ui-server | ✅ PASS | Good README, clear examples |

**Overall:** **13 of 15 packages FAIL the 5-minute rule.**

---

## Recommendations

### Immediate Actions (Before Public Release)

1. **Add READMEs to all P0 packages** (core, db, schema, cli, fetch, codegen, testing, cli-runtime)
   - Each README must include:
     - Installation (`npm install @vertz/<package>`)
     - Quick Start (minimal working example)
     - Core API overview
     - Link to full docs (when they exist)

2. **Fix `@vertz/canvas` and `@vertz/create-vertz-app`**
   - Remove from published packages, or
   - Properly scaffold with `package.json`, `src/`, `README.md`

3. **Create `examples/` directories** for top-tier packages:
   - `@vertz/core` — hello-world, routing, middleware, DI
   - `@vertz/ui` — counter, todo-list, data-fetching, routing
   - `@vertz/db` — define-schema, queries, migrations
   - `@vertz/schema` — form-validation, api-schemas

4. **Add type tests** to packages with generics:
   - `@vertz/fetch`, `@vertz/codegen`, `@vertz/primitives`, `@vertz/ui-server`

### Follow-Up Actions (Post-Release)

1. **Expand examples** across all packages
2. **Refactor unit tests** to use public APIs where appropriate (distinguish unit vs integration tests)
3. **Create integration tests** in `integration-tests/` that use public APIs end-to-end
4. **Add "Developer Walkthrough" sections** to all tickets going forward (enforce the Definition of Done)

---

## Audit Checklist for Future PRs

When reviewing any PR that adds or completes a feature, explicitly ask:

> **"Can a developer use this without reading the source code?"**

If the answer is no, the PR is not ready to merge.

Specifically check:
- [ ] Does the package have a README?
- [ ] Does the README include installation and quick start?
- [ ] Are there examples that use only the public API?
- [ ] Do generic types have `.test-d.ts` tests?
- [ ] Is there a changeset for the changes?

---

## Conclusion

The vertz monorepo has **strong internal quality**: comprehensive tests, good type inference, consistent changesets, and TDD discipline. However, it **fails the "Developer Walkthrough" gate** comprehensively.

**The gap is not in implementation — it's in communication.**

The packages are mostly *feature-complete* but not *consumption-ready*. Developers cannot discover, learn, or use the framework without reading source code.

**Next Steps:**
1. **Prioritize P0 READMEs** (core, db, schema, cli, fetch, codegen, testing, cli-runtime)
2. **Fix broken packages** (canvas, create-vertz-app)
3. **Add examples** (start with core, ui, db)
4. **Enforce the "Developer Walkthrough" gate** in all future PRs

Once these gaps are addressed, vertz will be ready for external consumption. The foundation is solid — it just needs a front door.

---

**Audit completed:** 2026-02-14  
**Auditor:** auditor (subagent)
