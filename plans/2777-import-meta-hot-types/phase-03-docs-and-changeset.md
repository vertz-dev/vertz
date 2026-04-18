# Phase 3: Mint-Docs Page + Changeset

## Context

Phases 1 and 2 fixed the subpath name and the call sites. This phase closes the discoverability gap the issue reporter actually experienced: a developer who hits `TS2339: Property 'hot' does not exist on type 'ImportMeta'` needs to be able to find a docs page that tells them "add `vertz/client` to `types`."

The existing mint-docs guide at `packages/mint-docs/guides/env.mdx` covers `import.meta.env` (Vertz env vars). A sibling `hmr-types.mdx` is the natural place for `import.meta.hot`.

See `/Users/viniciusdacal/conductor/workspaces/vertz/havana-v2/plans/2777-import-meta-hot-types.md`.

## Tasks

### Task 3.1: Mint-docs HMR types page

**Files:** (2)

- `packages/mint-docs/guides/hmr-types.mdx` (new)
- `packages/mint-docs/docs.json` (modified — add `hmr-types` to the navigation under the Guides section; match the existing `env.mdx` entry pattern)

**What to implement:**

1. Create `packages/mint-docs/guides/hmr-types.mdx`. Content covers:

   - **Opening paragraph.** One sentence: "When you write `import.meta.hot?.accept()` in a Vertz app, TypeScript may complain that `hot` doesn't exist on `ImportMeta`. Add the framework's client type augmentation to your tsconfig."
   - **The fix.** Show the two-line diff:
     ```jsonc
     {
       "compilerOptions": {
         "types": ["vertz/client"]
       }
     }
     ```
     Note that newly-scaffolded apps already have this.
   - **The `ImportMetaHot` surface.** Table or short list covering `accept()`, `accept(cb)`, `accept(deps, cb?)`, `dispose(cb)`, `data`. Tight one-line explanations.
   - **Why `hot` is `| undefined`.** One short section: HMR is only active under `vtz dev`; production builds and SSR have no `hot` object. Always optional-chain.
   - **Narrowing `data`.** Short code example:
     ```ts
     import.meta.hot?.dispose((data) => {
       data.lastCount = 42;
     });
     const prev = import.meta.hot?.data.lastCount as number | undefined;
     ```
     Note that `data` is typed `Record<string, unknown>` for safety; cast at the use site.
   - **Runtime behavior (two-liner).** `vtz dev` strips `import.meta.hot.*` lines server-side and uses WebSocket HMR; the Bun build plugin injects a guarded self-accept. Both paths make the code a no-op when `hot` isn't real.
   - **Link to follow-up.** One sentence acknowledging that Vite's full API (`invalidate`, `on`, `send`, etc.) is tracked as a follow-up issue.

2. Update `packages/mint-docs/docs.json` to register the new page. Find the existing entry for `guides/env` and add `guides/hmr-types` alongside it, matching the existing pattern. Do not move other entries around.

**Acceptance criteria:**

- [ ] `guides/hmr-types.mdx` exists, renders through the mint-docs build without errors.
- [ ] `docs.json` includes the new page; the build's structural validator passes.
- [ ] Example code in the doc typechecks (paste into a scratch file if there's any doubt).
- [ ] The page mentions: `vertz/client` subpath, `ImportMeta.hot | undefined`, the optional-chain idiom, narrowing `data`, runtime behavior under `vtz dev` vs Bun build plugin.
- [ ] TDD: mint-docs doesn't have a unit test for content. The "test" here is that the mint-docs build (`vtz run build` at the package level) still succeeds. Run it before declaring the task done.

---

### Task 3.2: Changeset

**Files:** (1)

- `.changeset/<slug>.md` (new)

**What to implement:**

Create a changeset with `patch` level per `policies.md` (pre-v1, patch only). The changelog line:

```markdown
---
'vertz': patch
'create-vertz-app': patch
---

Rename `vertz/env` → `vertz/client` so tsconfig `types` discoverability matches the Vite convention. The augmentation now correctly types `ImportMeta.hot` as `ImportMetaHot | undefined` (it only exists in dev), adds the `accept(cb)` callback overload for the in-repo HMR pattern, and drops the Bun-only `ImportMeta.main` property. Migrate by updating `tsconfig.json` to `"types": ["vertz/client"]` and call sites to `import.meta.hot?.accept()`.
```

**Acceptance criteria:**

- [ ] Changeset file exists under `.changeset/`.
- [ ] Level is `patch` for all affected packages.
- [ ] Changelog line mentions the rename, the `accept(cb)` overload, the dropped `main`, and the migration path.

---

## Follow-Up Issues to File at PR Open Time

These are pre-existing concerns surfaced by design-doc review but out of scope for this PR. File them as separate GitHub issues and link them from the PR body — do not silently skip per feedback memory.

1. **Audit `import.meta.main`.** The vtz Rust runtime never sets it; seven call sites (scaffold templates, `sites/dev-orchestrator/src/api/server.ts:149`, `examples/entity-todo/src/api/server.ts:16`, etc.) rely on `bun-types` for the type. Decide whether to implement it in the runtime or migrate callers.
2. **Vite-parity HMR API.** Add `invalidate()`, `on()`, `off()`, `send()`, `prune()`, `decline()` to `ImportMetaHot` — requires build-plugin and dev-server runtime support, not just types.
3. **Parallel `@vertz/ui/client` subpath.** For users who install `@vertz/ui` directly without the `vertz` meta-package.
4. **TS2339 diagnostic hint.** When the dev server surfaces a TS2339 on `import.meta.hot`, include a hint pointing to `vertz/client`.

---

## Review

After Phase 3 is green, spawn one adversarial review agent. The review checks:

- The docs page is accurate (no stale claims, no code that doesn't compile).
- The page is reachable from the docs navigation.
- The changeset is present and correctly levelled.
- All four follow-up issues have been filed with full bodies (not stubs) and linked from the PR description.

Review file: `reviews/2777-import-meta-hot-types/phase-03-docs-and-changeset.md`.
