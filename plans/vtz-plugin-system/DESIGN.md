# Vtz Plugin Rename & Cleanup

**Status:** Approved — three adversarial reviews done, all findings addressed, open questions resolved. Ready for phase breakdown.
**Author:** Vinicius Dacal (via Claude)
**Date:** 2026-04-17
**Branch:** `viniciusdacal/node-dx-feasibility`

---

## 1. Context

### Vertz positioning (settled)

- **Vertz** is the product — a full-stack TypeScript framework.
- **vtz** is the canonical dev runtime for every Vertz app. It also doubles as a local Cloudflare-compatible runtime (Workers, Queues, DO, KV, R2, D1, Hyperdrive).
- vtz is **not** multi-framework. React support is out of scope. If someone wants to run React, that's on them; vtz exists to give Vertz apps an excellent dev experience.
- **Production is runtime-agnostic** (Bun, Node, CF Workers). Dev is strictly vtz.

### Current plugin confusion

Two plugin-shaped concepts exist in the repo, named after the wrong runtimes:

- **Rust `FrameworkPlugin` trait** (`native/vtz/src/plugin/mod.rs:13`) — the canonical plugin contract for vtz dev. Implementations: `VertzPlugin` (hot path; invokes `vertz-compiler-core` directly in Rust) and `ReactPlugin` (vestigial). The `ReactPlugin` is wired through a `PluginChoice::{Vertz, React}` enum (`native/vtz/src/config.rs:5-198`), a `--plugin react` CLI flag, a `.vertzrc` entry, and package.json auto-detect (`config.rs:188-192`). None of it is used in real apps.
- **TS `createVertzBunPlugin`** (`packages/ui-server/src/bun-plugin/plugin.ts:135`) — a factory that returns a `BunPlugin`-shaped object. Consumed by `Bun.build()` at production build time. Not invoked by vtz in dev.

Every example and benchmark also ships a `bun-plugin-shim.ts` file. **These shims are orphans.** No `bunfig.toml` exists in the repo — the shim's own header comment says it's "for bunfig.toml consumption," but those configs were already removed when dev migrated to vtz. The files are loaded by nothing; they're dead code rotting in every example. The scaffold no longer generates them (`packages/create-vertz-app/src/__tests__/scaffold.test.ts:185` explicitly asserts their absence).

Consequences:
- "Plugin" means two unrelated things: a Rust trait in dev and a Bun-shaped factory in prod.
- Examples and benchmarks ship dead shim files that mislead LLM readers into thinking dev runs on Bun.
- Public docs (`docs/fullstack-app-setup.md`) still document the removed `bunfig.toml` + shim setup.
- `ReactPlugin` rots in Rust with CLI flags, tests, and auto-detect plumbing that no one uses.

### The directive

> Dev is strictly vtz. Production is runtime-agnostic (Bun, Node, CF Workers). Rename things properly and reflect the vtz plugin interface, not Bun's. Delete whatever isn't aligned.

### What this design is *not*

This is a naming + deletion cleanup. It is **not**:

- A new TS plugin system (rejected — hot-path performance).
- A V8-executed plugin pipeline.
- A new `@vertz/plugin` or `@vertz/build` package.
- A re-architecture of the dev hot path.

The dev hot path stays Rust-only. The production build stays a `BunPlugin`-returning factory consumed by `Bun.build()`. The changes are strictly: rename, delete, realign.

---

## 2. Goals & Non-Goals

### Goals

1. **Honest naming** — the Rust plugin trait is `VtzPlugin`. The TS production-build helper is `createVertzBuildPlugin()`. No public identifier named after Bun.
2. **Delete `ReactPlugin` end-to-end** — Rust file, CLI flag, `.vertzrc` handling, auto-detect, tests, embedded React fast-refresh JS assets, and the `PluginChoice` enum.
3. **Delete every `bun-plugin-shim.ts`** — orphaned dead code from the pre-vtz era. Also update docs that still reference them.
4. **Relocate & rename the TS build plugin** — `packages/ui-server/src/bun-plugin/` → `packages/ui-server/src/build-plugin/`; `createVertzBunPlugin` → `createVertzBuildPlugin`; `VertzBunPluginOptions` → `VertzBuildPluginOptions`; `VertzBunPluginResult` → `VertzBuildPluginResult`; subpath `@vertz/ui-server/bun-plugin` → `@vertz/ui-server/build-plugin`.
5. **Update all consumers** — including test files, subpath exports that indirectly target `dist/bun-plugin/`, build config entries, and docs.
6. **No backward-compat shims** — pre-v1 policy. Rename in place; no aliases.

### Non-Goals

- **No TS plugin system.** The Rust `VtzPlugin` trait remains the only plugin contract for dev. Extensions happen in Rust, not TS. Rationale: routing user plugins through V8 on every module request would add measurable per-file overhead with no corresponding user-facing win (no third-party plugin authors yet).
- **No V8 bridge for plugins.** deno_core has no NAPI loader; building one is a large, speculative investment.
- **No new packages** (`@vertz/plugin`, `@vertz/build`, etc.). The TS build-plugin stays in `@vertz/ui-server`.
- **No TS `VtzPlugin` type.** The name `VtzPlugin` lives only in Rust.
- **No decomposition** of `createVertzBunPlugin` into smaller plugins. It stays a single factory; only its name and location change.
- **No change to the dev hot path.** Rust `VertzPlugin::compile()` continues to call `vertz_compiler_core::compile()` directly. Zero performance impact.
- **No change to `vertz-compiler-core`** — stays Rust, stays NAPI-exposed.
- **No change to `vertz.config.ts`** — no plugin-array field, no new config.

### Breaking Changes (acknowledged)

External users arrived in April 2026. Pre-v1 policy permits breaking changes, but they must be called out:

- **Removed subpath `@vertz/ui-server/bun-plugin`** — any external code importing from this path will fail to resolve. Replacement: `@vertz/ui-server/build-plugin`.
- **Removed subpath `@vertz/vertz/ui-server/bun-plugin`** → replaced by `@vertz/vertz/ui-server/build-plugin`.
- **Removed identifiers** `createVertzBunPlugin`, `VertzBunPluginOptions`, `VertzBunPluginResult` → renamed 1:1 with `Build` prefix.
- **Removed CLI flag** `--plugin react` and `.vertzrc` `plugin: "react"` entries.

The changeset must flag these, and the PR description must enumerate them under "Breaking Changes."

### Roadmap fit

Test runner is the NEXT PRIORITY per `MEMORY.md` (`project-test-runner-priority.md`). This rename is small, mechanical, and self-contained — it will not delay test-runner work. Justification for slotting it in now:

- Every day the orphaned shim files remain, LLM agents reading the repo build wrong mental models about dev tooling (we've already seen this happen in conversation).
- External users see the old subpath in docs and get a confusing first impression.
- The `ReactPlugin` + CLI plumbing is ~1000 lines of dead Rust blocking confident future refactors.
- The rename is a blocker for the pending `docs/fullstack-app-setup.md` rewrite (currently documents a setup that no longer exists).

Expected total effort: 1–2 days single-thread. Can run in parallel with test-runner work on a separate branch.

---

## 3. Architecture (post-rename)

```
┌──────────────────────────────────────────────────────────────────┐
│ DEV (vtz)                                                         │
│                                                                    │
│   Incoming request → module_loader → VtzPlugin trait              │
│                                          │                         │
│                                          ▼                         │
│                                    VertzPlugin (Rust impl)         │
│                                          │                         │
│                                          ▼                         │
│                              vertz-compiler-core::compile()        │
│                                                                    │
│   No TS plugin execution. No V8 round-trip. Same as today.         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ PROD BUILD (Bun.build)                                            │
│                                                                    │
│   packages/cli/... → createVertzBuildPlugin() → BunPlugin         │
│                                (one factory)       │               │
│                                                    ▼               │
│                                           Bun.build({ plugins })   │
│                                                                    │
│   The factory internally calls @vertz/native-compiler (NAPI).     │
│   Same as today. Only the name/location change.                    │
└──────────────────────────────────────────────────────────────────┘
```

### Rust trait — what `VtzPlugin` means

`VtzPlugin` (formerly `FrameworkPlugin`) is a Rust trait implemented by framework-internal plugins that live inside the vtz crate. It is not a public user-facing contract. The sole real implementation is `VertzPlugin`. `ReactPlugin` is deleted.

### TS build plugin — what `createVertzBuildPlugin` means

`createVertzBuildPlugin(options)` is an internal factory in `@vertz/ui-server` that returns an object shaped like `BunPlugin` (the Bun type). Its consumer is `Bun.build()` during production build. The return type is still `BunPlugin` — this is honest because the *consumer* is Bun. The *name* reflects the *purpose* (a build plugin for Vertz apps), not the *runtime* it happens to target.

To prevent confusion, the factory and its result type carry explicit doc comments:

```ts
/**
 * Creates the Vertz production-build plugin.
 *
 * **What it does:** wraps the Vertz native compiler (`@vertz/native-compiler`) as a plugin
 * consumable by `Bun.build()` during `vertz build`.
 *
 * **Why "Build" and not "Bun":** the name reflects the *purpose* — this is Vertz's
 * build-time plugin. Today's consumer is `Bun.build()`, so the return type is
 * `BunPlugin`. If Vertz ever adds an alternate bundler backend (esbuild, Rolldown),
 * this factory's name stays stable while the return shape adapts.
 *
 * **Not for dev.** Dev runs on vtz with a Rust-side compiler plugin; this factory
 * is never invoked during `vertz dev`.
 */
export function createVertzBuildPlugin(options: VertzBuildPluginOptions): VertzBuildPluginResult;

/**
 * Return type of `createVertzBuildPlugin`. Shape is `BunPlugin` today because the
 * production build is driven by `Bun.build()`. See `createVertzBuildPlugin` for why
 * the name isn't "Bun".
 */
export interface VertzBuildPluginResult extends BunPlugin { /* ... */ }
```

### Why Rust and TS each have their own "plugin"

They're solving different problems:
- **Rust `VtzPlugin`** — in-process dev server extension point, called per-module, sync, no V8 hop.
- **TS `createVertzBuildPlugin`** — factory that emits a `BunPlugin` for `Bun.build()` at production build time, called once by the build orchestrator.

Both *happen* to wrap the same native compiler. They're not the same contract and shouldn't be unified — unifying them would require either moving the production build into Rust (huge) or routing dev through V8 (rejected).

---

## 4. API Surface (post-rename)

### Rust — `VtzPlugin` trait

```rust
// native/vtz/src/plugin/mod.rs

pub trait VtzPlugin: Send + Sync {
    fn name(&self) -> &str;
    fn compile(&self, source: &str, ctx: &CompileContext) -> Result<CompileOutput>;
    fn post_process(&self, code: &str, ctx: &PostProcessContext) -> Result<String>;
    fn resolve_import(&self, spec: &str) -> Option<String>;
    fn hmr_client_scripts(&self) -> Vec<ClientScript>;
    fn hmr_strategy(&self, result: &CompileOutput) -> HmrStrategy;
    fn root_element_id(&self) -> Option<&str>;
    fn head_html(&self) -> Option<&str>;
    fn watch_extensions(&self) -> Vec<&str>;
    fn restart_triggers(&self) -> Vec<&str>;
    fn env_public_prefixes(&self) -> Vec<&str>;
    fn supports_fast_refresh(&self) -> bool;
    fn module_id(&self, path: &Path, root: &Path) -> String;
    fn mcp_tool_definitions(&self) -> Vec<McpToolDefinition>;
    fn execute_mcp_tool(&self, name: &str, args: Value, ctx: &McpContext) -> Result<Value>;
}
```

No signature changes — only the trait name changes (`FrameworkPlugin` → `VtzPlugin`). Every method signature stays identical.

**Rename impact (verified via grep):** ~18 Rust files reference `FrameworkPlugin`. All use `Arc<dyn FrameworkPlugin>` / `&dyn FrameworkPlugin` / `Box<dyn FrameworkPlugin>` — clean trait-object substitution, no generic-bound gymnastics. A single pass with `sed`-style replace + `cargo check` iteration handles it.

### TS — `createVertzBuildPlugin`

```ts
// packages/ui-server/src/build-plugin/plugin.ts
import type { BunPlugin } from 'bun';

export interface VertzBuildPluginOptions {
  // identical shape to today's VertzBunPluginOptions
  rootDir: string;
  srcDir: string;
  target: 'dom' | 'ssr' | 'worker' | 'node';
  // ...
}

export interface VertzBuildPluginResult extends BunPlugin {
  // identical shape to today's VertzBunPluginResult
}

export function createVertzBuildPlugin(options: VertzBuildPluginOptions): VertzBuildPluginResult {
  return {
    name: 'vertz-build-plugin',  // renamed from 'vertz-bun-plugin'
    setup(build) {
      // identical body; only the log prefix changes
    },
  };
}
```

No behavioral changes beyond:
- The `name` field on the returned BunPlugin changes from `'vertz-bun-plugin'` to `'vertz-build-plugin'`.
- Log prefix `[vertz-bun-plugin]` changes to `[vertz-build-plugin]`.

These are cosmetic but surface in bundler diagnostics and logs — worth calling out in the changeset.

### Consumer migration examples

```ts
// BEFORE: packages/cli/src/pipeline/orchestrator.ts
const { createVertzBunPlugin } = await import('@vertz/ui-server/bun-plugin');
import type { VertzBunPluginOptions } from '@vertz/ui-server/bun-plugin';

// AFTER
const { createVertzBuildPlugin } = await import('@vertz/ui-server/build-plugin');
import type { VertzBuildPluginOptions } from '@vertz/ui-server/build-plugin';
```

---

## 5. Deletion List (verified via grep)

### Rust — React deletion (end-to-end)

- `native/vtz/src/plugin/react.rs` (726 lines) — entire file
- `native/vtz/src/plugin/mod.rs` — remove `pub mod react;` and any `ReactPlugin` re-exports
- `native/vtz/src/config.rs` — remove `PluginChoice::React` enum variant, remove `--plugin react` / `.vertzrc` parsing (lines 5–198), remove `package.json` auto-detect (lines 188–192)
- `native/vtz/src/config.rs` tests — remove React-related tests (lines 660–833, ~15 tests)
- `native/vtz/src/server/http.rs:1440` — the `PluginChoice::React => ReactPlugin::new()` match arm
- `native/vtz/src/main.rs` — `--plugin` CLI argument schema: either narrow to no-op (single-value) or remove the flag entirely
- Embedded JS assets: `react-refresh-runtime.js`, `react-refresh-setup.js` (only referenced by `react.rs` via `include_str!` at lines 6, 9 — dead after the file is removed)
- Any React-specific fixtures/tests in `native/vtz/tests/` (confirmed none found)

### TypeScript — shim deletion

- Six `bun-plugin-shim.ts` files (all orphaned; nothing loads them):
  - `examples/task-manager/bun-plugin-shim.ts`
  - `examples/linear/bun-plugin-shim.ts`
  - `examples/entity-todo/bun-plugin-shim.ts`
  - `benchmarks/vertz/bun-plugin-shim.ts`
  - `packages/landing/bun-plugin-shim.ts`
  - `packages/component-docs/bun-plugin-shim.ts`

### TypeScript — identifier removal (across 20+ files, verified)

The identifiers `createVertzBunPlugin`, `VertzBunPluginOptions`, `VertzBunPluginResult`, and the string literal `vertz-bun-plugin` are referenced from:

**Source:**
- `packages/ui-server/src/bun-plugin/` (entire directory — renamed, contents edited)
- `packages/vertz/src/ui-server-bun-plugin.ts` — renamed to `ui-server-build-plugin.ts`, re-export updated

**Tests:**
- `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts`
- `packages/cli/src/pipeline/__tests__/orchestrator.test.ts`
- `packages/ui-server/src/__tests__/native-compiler-plugin-integration.test.ts`
- `packages/ui-server/src/__tests__/bun-plugin-onload.test.ts` (file renamed + import)
- `packages/ui-server/src/__tests__/bun-plugin-manifest-hmr.test.ts` (file renamed + import)
- `packages/ui-server/src/__tests__/fast-refresh-dom-state.test.ts`
- `packages/ui-server/src/__tests__/fast-refresh-runtime.test.ts`
- `packages/ui-server/src/__tests__/state-inspector.test.ts`
- `packages/ui-server/src/bun-plugin/__tests__/sourcemap-offset.test.ts` (moves with dir)
- `packages/ui-server/src/bun-plugin/__tests__/route-splitting-plugin.test.ts` (moves with dir)
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts:185` — update the "does NOT generate bun-plugin-shim.ts" assertion target to new name (or keep the assertion as-is since shims won't be generated anyway)

**Consumers:**
- `packages/cli/src/pipeline/orchestrator.ts` (line 15 type import, line 378 dynamic import)
- `packages/cli/src/production-build/ui-build-pipeline.ts` (lines 163, 168, 375)

**Package/build config:**
- `packages/ui-server/package.json` — subpath `./bun-plugin` → `./build-plugin`; subpaths `./fast-refresh-runtime` (line 39) and `./state-inspector` (line 44) point at `./dist/bun-plugin/*` and must update to `./dist/build-plugin/*`
- `packages/ui-server/package.json` line 62 — `"test:integration"` script path references `src/bun-plugin/__tests__/image-processor.local.ts` → update
- `packages/ui-server/build.config.ts:17-22` — 4 entry paths under `src/bun-plugin/` and `outDir: 'dist/bun-plugin'` → update
- `packages/vertz/package.json` line 90 — subpath `./ui-server/bun-plugin` → `./ui-server/build-plugin`; dist filename `ui-server-bun-plugin.{js,d.ts}` → `ui-server-build-plugin.{js,d.ts}`

**Docs:**
- `packages/ui/README.md` (line 30)
- `docs/fullstack-app-setup.md` — currently documents `bunfig.toml` + shim setup (lines 15, 20, 80, 87). Rewrite or delete; the setup it describes no longer exists.
- `packages/site/pages/guides/deploy/static-sites.mdx` — references old subpath
- `packages/mint-docs/` — grep-confirmed; update any hits

**CHANGELOGs (historical, not rewritten but noted):**
- `packages/create-vertz-app/CHANGELOG.md` line 233 mentions PR #903 adding `bunfig.toml` + shim
- `packages/runtime/CHANGELOG.md`

CHANGELOGs preserve history — old entries stay. A new changeset entry documents the rename.

### Scaffold (`packages/create-vertz-app`)

Verified: the scaffold does NOT generate `bun-plugin-shim.ts` today (`scaffold.test.ts:185` asserts absence). No template changes required; only the test assertion may need its phrasing updated if any `createVertzBunPlugin` references appear in scaffold templates. Full grep during Phase 2 to confirm.

---

## 6. Rename List (1:1 mapping)

| Kind | Before | After |
|---|---|---|
| Rust trait | `FrameworkPlugin` | `VtzPlugin` |
| Rust file | `native/vtz/src/plugin/mod.rs` (trait inside) | same file, trait renamed |
| Rust enum variant | `PluginChoice::React` | *(deleted)* |
| Rust CLI flag | `--plugin react` | *(deleted; `--plugin vertz` becomes vestigial or removed)* |
| TS dir | `packages/ui-server/src/bun-plugin/` | `packages/ui-server/src/build-plugin/` |
| TS function | `createVertzBunPlugin` | `createVertzBuildPlugin` |
| TS type | `VertzBunPluginOptions` | `VertzBuildPluginOptions` |
| TS type | `VertzBunPluginResult` | `VertzBuildPluginResult` |
| TS string literal | `'vertz-bun-plugin'` (plugin `name` + log prefix) | `'vertz-build-plugin'` |
| Subpath export | `@vertz/ui-server/bun-plugin` | `@vertz/ui-server/build-plugin` |
| Subpath export | `@vertz/vertz/ui-server/bun-plugin` | `@vertz/vertz/ui-server/build-plugin` |
| Source file | `packages/vertz/src/ui-server-bun-plugin.ts` | `packages/vertz/src/ui-server-build-plugin.ts` |
| Dist filename | `dist/ui-server-bun-plugin.{js,d.ts}` (in `@vertz/vertz`) | `dist/ui-server-build-plugin.{js,d.ts}` |
| Subpath target | `./dist/bun-plugin/fast-refresh-runtime.js` | `./dist/build-plugin/fast-refresh-runtime.js` |
| Subpath target | `./dist/bun-plugin/state-inspector.js` | `./dist/build-plugin/state-inspector.js` |
| Build output dir | `packages/ui-server/dist/bun-plugin` | `packages/ui-server/dist/build-plugin` |

---

## 7. Manifesto Alignment

- **One way to do things** — dev has one plugin system (Rust `VtzPlugin`). Production build has one factory (`createVertzBuildPlugin`). No shims, no alternate paths, no `--plugin react` flag.
- **Honest APIs** — no public identifier is named after a runtime that isn't in play. The Rust trait is `VtzPlugin` because its host is vtz. The TS factory is `createVertzBuildPlugin` because its purpose is building; its consumer (`Bun.build()`) is an implementation detail surfaced only in the return type's doc comment.
- **LLM-first** — fewer files, fewer concepts. An LLM reading the repo will no longer see "bun-plugin-shim.ts" in every example and wonder whether dev runs on Bun. The factory's doc comment explicitly explains why `VertzBuildPluginResult` extends `BunPlugin`.
- **No backward-compat shims** — pre-v1 policy. Every rename is in place; nothing is aliased.
- **Pragmatism over purity** — we resisted unifying Rust trait + TS factory into a single "VtzPlugin" abstraction. They serve different purposes; merging them would cost performance or require a large V8 bridge.

---

## 8. Unknowns

**None identified.** All surface areas grep-verified. The deletion list is exhaustive (confirmed via grep for `FrameworkPlugin`, `ReactPlugin`, `PluginChoice`, `bun-plugin-shim`, `createVertzBunPlugin`, `VertzBunPlugin`, `vertz-bun-plugin`, `@vertz/ui-server/bun-plugin`, `@vertz/vertz/ui-server/bun-plugin`). Any hit missed by the design will surface as a build failure during Phase 1 or Phase 2 quality gates.

---

## 9. POC Results

Not applicable. The scope is a rename + deletion; no behavioral change to validate.

---

## 10. Type Flow Map

No new generics are introduced. The TS factory's input/output types (`VertzBuildPluginOptions`, `VertzBuildPluginResult`) keep identical shapes — only the names change. No dead generics. No new `.test-d.ts` files needed.

---

## 11. E2E Acceptance Test

```ts
// Integration + repo-level tests

describe('Feature: Vtz plugin rename cleanup', () => {
  describe('Given the repo after the rename', () => {
    describe('When searching for legacy Bun-plugin identifiers', () => {
      it('no file matches `bun-plugin-shim.ts`', async () => {
        const matches = await glob('**/bun-plugin-shim.ts', {
          cwd: repoRoot,
          ignore: ['**/node_modules/**'],
        });
        expect(matches).toEqual([]);
      });

      it('no TS file imports from `@vertz/ui-server/bun-plugin`', async () => {
        const hits = await grep("from '@vertz/ui-server/bun-plugin'", {
          path: repoRoot,
          exclude: ['node_modules', 'CHANGELOG.md'],
        });
        expect(hits).toEqual([]);
      });

      it('no TS file references `createVertzBunPlugin`', async () => {
        const hits = await grep('createVertzBunPlugin', {
          path: repoRoot,
          exclude: ['node_modules', 'CHANGELOG.md'],
        });
        expect(hits).toEqual([]);
      });

      it('no TS file references `VertzBunPluginOptions` or `VertzBunPluginResult`', async () => {
        for (const id of ['VertzBunPluginOptions', 'VertzBunPluginResult']) {
          const hits = await grep(id, { path: repoRoot, exclude: ['node_modules', 'CHANGELOG.md'] });
          expect(hits).toEqual([]);
        }
      });

      it('no file references the string literal `vertz-bun-plugin`', async () => {
        const hits = await grep('vertz-bun-plugin', {
          path: repoRoot,
          exclude: ['node_modules', 'CHANGELOG.md'],
        });
        expect(hits).toEqual([]);
      });
    });

    describe('When searching for renamed identifiers', () => {
      it('`createVertzBuildPlugin` is the public export of `@vertz/ui-server/build-plugin`', async () => {
        const mod = await import('@vertz/ui-server/build-plugin');
        expect(typeof mod.createVertzBuildPlugin).toBe('function');
      });

      it('`packages/ui-server/package.json` publishes the `./build-plugin` subpath', async () => {
        const pkg = JSON.parse(await readFile('packages/ui-server/package.json', 'utf8'));
        expect(pkg.exports['./build-plugin']).toBeDefined();
        expect(pkg.exports['./bun-plugin']).toBeUndefined();
      });
    });

    describe('When running `vertz build` on each affected example/benchmark', () => {
      const apps = [
        'examples/task-manager', 'examples/linear', 'examples/entity-todo',
        'benchmarks/vertz', 'packages/landing', 'packages/component-docs',
      ];
      for (const app of apps) {
        it(`${app}: production build succeeds using the renamed factory`, async () => {
          const result = await runVertzBuild(app);
          expect(result.exitCode).toBe(0);
        });
      }
    });

    describe('When running `vertz dev` on each affected example', () => {
      const examples = ['examples/task-manager', 'examples/linear', 'examples/entity-todo'];
      for (const app of examples) {
        it(`${app}: dev server boots, serves a .tsx file with Vertz transforms applied`, async () => {
          const { port, kill } = await startVertzDev(app);
          const code = await (await fetch(`http://localhost:${port}/src/App.tsx`)).text();
          expect(code).toContain('signal');
          await kill();
        });
      }
    });
  });

  describe('Given the Rust vtz crate', () => {
    it('exposes the `VtzPlugin` trait (not `FrameworkPlugin`)', async () => {
      const contents = await readFile('native/vtz/src/plugin/mod.rs', 'utf8');
      expect(contents).toMatch(/pub trait VtzPlugin/);
      expect(contents).not.toMatch(/pub trait FrameworkPlugin/);
    });

    it('does not include `react.rs`', async () => {
      expect(await fileExists('native/vtz/src/plugin/react.rs')).toBe(false);
    });

    it('does not define `PluginChoice::React`', async () => {
      const config = await readFile('native/vtz/src/config.rs', 'utf8');
      expect(config).not.toMatch(/PluginChoice::React/);
    });

    it('does not accept `--plugin react`', async () => {
      const result = await runCommand('vtz', ['--plugin', 'react', '--help']);
      expect(result.stderr).toMatch(/unknown|invalid/i);
    });

    it('passes `cargo test --all` and `cargo clippy --all-targets -- -D warnings`', async () => {
      const test = await runCargo('test --all');
      const clippy = await runCargo('clippy --all-targets -- -D warnings');
      expect(test.exitCode).toBe(0);
      expect(clippy.exitCode).toBe(0);
    });
  });

  describe('Given public docs', () => {
    it('`docs/fullstack-app-setup.md` does not reference `bun-plugin-shim.ts` or `bunfig.toml`', async () => {
      const contents = await readFile('docs/fullstack-app-setup.md', 'utf8');
      expect(contents).not.toMatch(/bun-plugin-shim/);
      expect(contents).not.toMatch(/bunfig\.toml/);
    });

    it('`packages/mint-docs/` pages do not reference the old subpath', async () => {
      const hits = await grep('@vertz/ui-server/bun-plugin', { path: 'packages/mint-docs' });
      expect(hits).toEqual([]);
    });
  });
});
```

---

## 12. Phase-Level Migration Sketch

Phases are ordered to keep the repo in a buildable state after every phase. Phases will be broken into individual phase files under `plans/vtz-plugin-system/phase-NN-<slug>.md` after design approval.

- **Phase 1 — Rust: `ReactPlugin` + `PluginChoice::React` end-to-end deletion.** Delete `native/vtz/src/plugin/react.rs`, `PluginChoice::React` enum variant + parsing + auto-detect in `config.rs`, match arm in `http.rs:1440`, React-related tests in `config.rs`, embedded React fast-refresh JS assets. Remove the `--plugin` CLI flag entirely (decision §13.1). Quality gates: `cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check`. Repo builds and runs; vtz dev still works for Vertz apps.

- **Phase 2 — Rust: `FrameworkPlugin` → `VtzPlugin` trait rename.** Rename in `native/vtz/src/plugin/mod.rs` and update all ~18 call sites (`Arc<dyn FrameworkPlugin>` → `Arc<dyn VtzPlugin>`, etc.). Quality gates: cargo test + clippy + fmt. Mechanical rename; repo still builds.

- **Phase 3 — TS: renames + consumer updates in a single atomic step.** *This phase is atomic because splitting it would leave the TS build broken mid-phase.* In one commit chain:
  - Move `packages/ui-server/src/bun-plugin/` → `packages/ui-server/src/build-plugin/`
  - Rename `createVertzBunPlugin` → `createVertzBuildPlugin`, `VertzBunPluginOptions` → `VertzBuildPluginOptions`, `VertzBunPluginResult` → `VertzBuildPluginResult`
  - Change string literals `'vertz-bun-plugin'` → `'vertz-build-plugin'`
  - Update `packages/ui-server/package.json` subpaths (`./bun-plugin` → `./build-plugin`; retarget `./fast-refresh-runtime` and `./state-inspector` to `./dist/build-plugin/*`)
  - Update `packages/ui-server/build.config.ts` entries + `outDir`
  - Update `packages/ui-server/package.json` `test:integration` script path
  - Rename `packages/vertz/src/ui-server-bun-plugin.ts` → `ui-server-build-plugin.ts` and update `packages/vertz/package.json` subpath
  - Update consumers: `packages/cli/src/pipeline/orchestrator.ts`, `packages/cli/src/production-build/ui-build-pipeline.ts`
  - Update all test files referencing old names (ui-server tests + CLI tests + production-build tests)
  - Quality gates: `vtz test && vtz run typecheck && vtz run lint` repo-wide.

- **Phase 4 — Shim & orphan cleanup.** Delete all six `bun-plugin-shim.ts` files. Run `vtz dev` in each affected example and benchmark to confirm boot + HMR cycle; run `vertz build` in each to confirm production build. This is the acceptance gate: every affected app must boot cleanly before the phase is done.

- **Phase 5 — Docs.** Delete `docs/fullstack-app-setup.md` (decision §13.3 — content describes a setup that no longer exists). Update `packages/ui/README.md`, `packages/site/pages/guides/deploy/static-sites.mdx`, and any `packages/mint-docs/` pages that reference the old subpath. Add a changeset entry flagging breaking changes.

- **Phase 6 — Final repo-wide gates + adversarial review.** Full `vtz test && vtz run typecheck && vtz run lint` + Rust gates. Per-phase adversarial review per `.claude/rules/local-phase-workflow.md`.

---

## 13. Decisions

1. **Rust CLI flag `--plugin`** — removed entirely. Once `ReactPlugin` is gone, there's one plugin and the flag is dead UI. Add to Phase 1 deletion.
2. **Subpath name** — `./build-plugin` (mirrors file structure and function name; less ambiguous than `./build`).
3. **`docs/fullstack-app-setup.md`** — deleted. Current content documents a setup that no longer works; a new vtz-native setup guide is not in scope here. Phase 5 becomes "delete the file" rather than "rewrite."
