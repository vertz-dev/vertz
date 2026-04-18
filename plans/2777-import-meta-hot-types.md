# `import.meta.hot` TypeScript Type Augmentation (#2777)

## Problem

`vtz dev` injects `import.meta.hot` for HMR support, but invoking it in user code produces a TypeScript error:

```ts
// entry-client.ts
import.meta.hot.accept();
// TS2339: Property 'hot' does not exist on type 'ImportMeta'.
```

### Current state

The type augmentation **already exists** in `packages/vertz/env.d.ts` and is exported as the types-only subpath `vertz/env`. The scaffold template adds `"types": ["vertz/env"]` to the generated tsconfig, so new projects work. But three things are broken:

1. **Discoverability.** The name `vertz/env` reads as "environment variables", not "runtime-injected client globals." A developer hitting TS2339 does not guess the right subpath. The issue author explicitly suggests `vertz/client` (the Vite convention).
2. **The type shape is wrong in a way the current call sites mask.** `env.d.ts` types `accept(deps: string | string[], cb?: ...)` — no single-callback overload. `poc/ssr-hmr/client.tsx:23` uses `import.meta.hot.accept(() => { ... })`, which would fail once the types are enforced. `hot` is typed `ImportMetaHot | undefined`, but every scaffold and example call site uses `import.meta.hot.accept()` without optional chaining — TS2532 the moment the augmentation is in scope.
3. **Our own examples don't include the subpath.** `examples/{task-manager,linear,entity-todo,contacts-api}/tsconfig.json` list only `"bun-types"`. They currently compile because `bun-types` also declares a (different) `ImportMeta.hot` — meaning the current "green" in our examples is because Bun's types are doing the work, not ours.

## Public API Changes

- **Breaking:** subpath export renamed `vertz/env` → `vertz/client`. Any tsconfig with `"types": ["vertz/env"]` must switch to `"types": ["vertz/client"]`. No shim (pre-v1 policy).
- **Breaking:** `ImportMetaHot.accept` gains a single-callback overload — `accept(cb?: (newModule: unknown) => void): void` — matching the build-plugin-injected API. The previous signatures continue to work.
- **Breaking:** `import.meta.hot` remains `ImportMetaHot | undefined`. Scaffold template and all call sites updated to `import.meta.hot?.accept()` (optional chaining) — reflecting the fact that `hot` is injected only in dev mode.
- **Breaking:** `ImportMeta.main` removed from the augmentation. It is a Bun-ism, not a vtz runtime guarantee (verified: `native/vtz/src/runtime/module_loader.rs` polyfills `import.meta.dirname` and has an env replacer, but never sets `main`). Callers that use `import.meta.main` continue to rely on `bun-types`. A follow-up issue is filed to audit whether `main` should be implemented in the vtz runtime; not part of this PR.
- **Additive:** new mint-docs page `packages/mint-docs/guides/hmr-types.mdx` documenting `vertz/client`, the shape of `ImportMeta.hot`, and when/how to add it to tsconfig `types`.

## API Surface

### Before

```jsonc
// tsconfig.json
{ "compilerOptions": { "types": ["vertz/env"] } }
```

```ts
/// <reference types="vertz/env" />
// packages/vertz/env.d.ts
interface ImportMetaHot {
  accept(): void;
  accept(deps: string | string[], cb?: (modules: unknown[]) => void): void;
  dispose(cb: (data: Record<string, unknown>) => void): void;
  data: Record<string, unknown>;
}
interface ImportMeta {
  readonly main: boolean;                      // removed
  readonly hot: ImportMetaHot | undefined;
}
```

### After

```jsonc
// tsconfig.json
{ "compilerOptions": { "types": ["vertz/client"] } }
```

```ts
/// <reference types="vertz/client" />
// packages/vertz/client.d.ts
declare global {
  interface ImportMetaHot {
    /** Self-accept HMR updates for this module. */
    accept(): void;
    /** Accept HMR updates and run a callback with the new module. */
    accept(cb: (newModule: unknown) => void): void;
    /** Accept HMR updates for specific dependencies. */
    accept(deps: string | readonly string[], cb?: (modules: unknown[]) => void): void;
    /** Runs before the module is replaced — persist state into `data`. */
    dispose(cb: (data: Record<string, unknown>) => void): void;
    /** Persistent data across HMR updates. */
    data: Record<string, unknown>;
  }

  interface ImportMeta {
    /** Hot Module Replacement API. Defined only in dev mode; undefined in production. */
    readonly hot: ImportMetaHot | undefined;
  }
}

export {};
```

Wrapping in `declare global { ... }` with a trailing `export {};` guarantees the file is treated as a module and the augmentation still applies globally. This is robust against a future `import type` addition to the file — without it, the instant an `import` appears, the interfaces become module-scoped and the global augmentation silently disappears.

### Call-site updates

Every current user of `import.meta.hot.*` switches to optional chaining, matching the fact that `hot` may be undefined at runtime:

```diff
- import.meta.hot.accept();
+ import.meta.hot?.accept();
```

Files touched (verified via grep):

- `packages/create-vertz-app/src/templates/index.ts:887` (scaffold template)
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts:294` (scaffold test assertion)
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts:301` (template test assertion)
- `packages/landing/src/entry-client.ts:5`
- `packages/component-docs/src/entry-client.ts:6`
- `examples/task-manager/src/entry-client.ts:15`
- `examples/linear/src/entry-client.ts:12`
- `examples/entity-todo/src/entry-client.ts:14`
- `poc/ssr-hmr/client.tsx:21-28` — already uses an `if (import.meta.hot)` guard, so its inner `import.meta.hot.accept(cb)` stays non-optional; no change needed.

### `package.json` change

```diff
 "files": [
   "dist",
-  "env.d.ts"
+  "client.d.ts"
 ],
 "exports": {
-  "./env": {
+  "./client": {
-    "types": "./env.d.ts"
+    "types": "./client.d.ts"
   }
 }
```

### Scaffold template change

`packages/create-vertz-app/src/templates/index.ts:650` changes `"types": ["vertz/env"]` → `"types": ["vertz/client"]`.

### Example apps

All four `examples/*/tsconfig.json` extend their `types` arrays to include `"vertz/client"`. We keep `bun-types` because several example files rely on Bun APIs (`Bun.serve`, `import.meta.main`) and removing them is out of scope for this PR. Declaration merging means both `bun-types.ImportMeta` and `vertz/client.ImportMeta` contribute — our augmentation adds `hot`, Bun's adds `main`. Verified in §Unknowns.

## Manifesto Alignment

- **Batteries included** — the HMR API is a framework-provided dev-mode runtime injection. Shipping the types file but misnaming it or leaving call sites typed incorrectly fails this principle. The PR makes "import HMR types" a single, well-named subpath.
- **Zero-config dev loop** — matching the Vite convention (`vertz/client`) removes friction for developers migrating from Vite. The scaffold already opts users in.
- **LLM-first** — the rename is neutral for LLMs; they configure tsconfig from the scaffold template, which is updated in the same PR.

### What was rejected

1. **Auto-include via `@vertz/ui`'s package types.** Considered re-exporting the ambient augmentation transitively from `@vertz/ui`'s main `.d.ts`. Rejected: ambient globals from a regular import are surprising and contaminate non-client contexts. Opt-in via `types` is the accepted TS pattern. A parallel `@vertz/ui/client` subpath was considered; deferred as a follow-up because 100% of in-repo HMR users already depend on the `vertz` meta-package.
2. **Keep `vertz/env` as a deprecated alias.** Rejected per pre-v1 policy: no backward-compat shims.
3. **Expand `ImportMetaHot` to full Vite parity (`invalidate`, `on`, `send`, `prune`, `decline`).** Rejected for scope — the build plugin currently only injects `accept` semantics. A follow-up issue is filed for parity.
4. **Type `hot` as non-optional `ImportMetaHot`.** Rejected because `packages/ui-server/src/build-plugin/plugin.ts:488` literally emits `if (import.meta.hot) import.meta.hot.accept();` — confirming the runtime-optional contract. Keeping `| undefined` is the truthful type; updating call sites to `?.` is the correct fix.
5. **Documentation-only fix.** Rejected because the misleading name is the root cause of discoverability confusion; the rename is cheap and honest.
6. **Type `data` as `any` (Vite's choice).** Vite uses `any` for `import.meta.hot.data`, which is ergonomic but silently disables type checking on every access. Vertz prefers safe-by-default, so `data: Record<string, unknown>` is kept and the mint-docs page documents the narrowing idiom (`const prev = hot.data.lastCount as number | undefined` or a typed helper). The user pays a tiny tax for safety; the alternative is a silent footgun.

## Non-Goals

- Implementing new `ImportMetaHot` methods (`invalidate`, `on`, `send`, `prune`, `decline`). Tracked in follow-up issue.
- Auditing `import.meta.main` across the repo and deciding whether to implement it in the vtz runtime. Tracked in follow-up issue.
- Adding a parallel `@vertz/ui/client` subpath for users who install `@vertz/ui` without the `vertz` meta-package. Tracked in follow-up issue — no in-repo user of the type hits this today.
- Compiler/editor diagnostics that point users to `vertz/client` when they hit TS2339. Tracked in follow-up issue (dev server's error overlay could special-case this).
- A migration guide. The rename is covered by the PR description's Public API Changes block and the new mint-docs page; no separate guide.

## Unknowns

- **Declaration merging between `bun-types.ImportMeta` and `vertz/client.ImportMeta`.** Bun's types declare their own `ImportMeta` (covering `main`, `env`, etc.). TypeScript's declaration merging rule combines same-named interfaces in global scope. Verified empirically: with both in `types`, `import.meta.hot` (from us), `import.meta.main` (from Bun), and `import.meta.env` (from Bun) all resolve correctly under `strict` + `moduleResolution: "bundler"`. A test at `packages/vertz/__tests__/import-meta-hot.test-d.ts` locks this in.

No other unknowns.

## POC Results

Not required — the type file already exists in production. The rename is a build/packaging change, the accept-overload addition is mechanical, and the `declare global` wrapping has known TypeScript semantics. The Vite reference was validated against `node_modules/bun-types/docs/` and Vite's public `HotPayload` types.

## Type Flow Map

No generics. The file is two plain interfaces inside a `declare global` block. Verification strategy:

`packages/vertz/__tests__/import-meta-hot.test-d.ts`:

```ts
/// <reference types="vertz/client" />
import { expectTypeOf } from '@vertz/test';

// Positive: hot is optional and has the documented surface.
expectTypeOf(import.meta.hot).toEqualTypeOf<ImportMetaHot | undefined>();
expectTypeOf<ImportMetaHot>().toHaveProperty('accept');
expectTypeOf<ImportMetaHot>().toHaveProperty('dispose');
expectTypeOf<ImportMetaHot>().toHaveProperty('data');

// Positive: all three accept overloads typecheck.
import.meta.hot?.accept();
import.meta.hot?.accept(() => {});
import.meta.hot?.accept('./dep', (mods) => mods);
import.meta.hot?.accept(['./a', './b'], (mods) => mods);

// Positive: dispose + data round-trip.
import.meta.hot?.dispose((data) => { data.x = 1; });
const _prev: unknown = import.meta.hot?.data.x;

// Negative: no single-string-non-callback form (must be a dep path WITH a callback or a callback alone).
// @ts-expect-error — bare string without a dep-callback is rejected
import.meta.hot?.accept('not-a-callback');

// Negative: no arbitrary methods.
// @ts-expect-error — no such method
import.meta.hot?.invalidate();
```

## E2E Acceptance Test

From a freshly scaffolded Vertz app (`create-vertz-app` then `vtz run typecheck`):

- `src/entry-client.ts` with `import.meta.hot?.accept();` typechecks clean.
- Changing the tsconfig to remove `"vertz/client"` from `types` produces TS2339 on `hot` — proving the augmentation is what makes the code compile.
- `src/api/server.ts` with `if (import.meta.main)` still typechecks because the scaffold includes `bun-types`.

### Repository-level acceptance

- `grep -r "vertz/env"` (excluding `plans/`, `reviews/`, `.changeset/`) returns no matches.
- In **user-facing code** (scaffold templates, `examples/`, `packages/landing`, `packages/component-docs`) every `import.meta.hot.*` call uses optional chaining (`?.`). Framework-internal files that rely on Bun's static analysis (`packages/ui-server/src/build-plugin/plugin.ts:488`, `packages/ui-server/src/build-plugin/fast-refresh-runtime.ts:27`, `poc/ssr-hmr/client.tsx:21-28`) keep the `if (import.meta.hot) import.meta.hot.accept()` pattern — Bun's analysis cannot detect optional-chained accepts. A reviewer-checklist item in the phase file asserts each non-optional call is either inside an `if (import.meta.hot)` guard or is Bun-plugin-generated.
- Full quality gates pass: `vtz test && vtz run typecheck && vtz run lint`.
- Subpath exports test (`packages/vertz/__tests__/subpath-exports.test.ts:121-134`) asserts `./client` is types-only, `./env` is affirmatively asserted to be absent (prevents accidental re-addition via copy/paste).
- Runtime alignment is documented: `native/vtz/src/compiler/pipeline.rs:1385-1400` strips `import.meta.hot.*` lines under the vtz dev server (uses WebSocket HMR instead), while `packages/ui-server/src/build-plugin/plugin.ts:488` injects a guarded self-accept under the Bun build pipeline. The type's `ImportMetaHot | undefined` accurately reflects "this API may not exist at runtime — optional chain it."

## Follow-Up Issues (to file alongside the PR)

Per `.claude/rules/` feedback: any pre-existing bug surfaced by review but not fixed in this PR must be tracked, not silently skipped.

1. **Audit `import.meta.main` across repo.** `native/vtz/` does not set `import.meta.main`. Decide whether to implement it in the runtime or migrate the seven callers (`examples/entity-todo`, `sites/dev-orchestrator`, scaffold templates, etc.) to another entry-point check.
2. **Vite-parity HMR API.** Add `invalidate()`, `on()`, `send()`, `prune()`, `decline()` to `ImportMetaHot` — requires build-plugin and dev-server runtime support, not just types.
3. **Parallel `@vertz/ui/client` subpath.** Let users who install only `@vertz/ui` pull the HMR types without going through the `vertz` meta-package.
4. **Compiler diagnostic for TS2339 on `import.meta.hot`.** When the dev server surfaces this error, include a hint pointing to `vertz/client`.

## Definition of Done

- [ ] `packages/vertz/env.d.ts` renamed to `packages/vertz/client.d.ts`, wrapped in `declare global { ... } export {};`.
- [ ] `accept(cb)` overload added; `ImportMeta.main` removed from augmentation; file header comment updated.
- [ ] `packages/vertz/package.json`: `./env` export renamed to `./client`, `files` array updated.
- [ ] `packages/vertz/__tests__/subpath-exports.test.ts` asserts `./client` (types-only, exists on disk) AND affirmatively asserts `./env` does not exist (anti-regression).
- [ ] `packages/vertz/__tests__/import-meta-hot.test-d.ts` added per §Type Flow Map.
- [ ] `packages/create-vertz-app/src/templates/index.ts:650` uses `vertz/client`; `entry-client.ts` template at :887 uses `?.`.
- [ ] `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` and `scaffold.test.ts` assertions updated to match `?.` and `vertz/client`.
- [ ] `examples/{task-manager,linear,entity-todo,contacts-api}/tsconfig.json` extended to include `"vertz/client"`. Their `entry-client.ts` files migrated to `?.`.
- [ ] `packages/landing/src/entry-client.ts` and `packages/component-docs/src/entry-client.ts` migrated to `?.`.
- [ ] `packages/mint-docs/guides/hmr-types.mdx` added alongside the existing `env.mdx` guide, documenting: the `vertz/client` subpath, the `ImportMetaHot` shape, the optional-chaining idiom, and a narrowing example for `data` (since it is `Record<string, unknown>`, not `any`).
- [ ] Follow-up issues filed for the four items under §Follow-Up Issues, linked from the PR description.
- [ ] Adversarial review written to `reviews/2777-import-meta-hot-types/phase-NN-<slug>.md`.
- [ ] Retrospective at `plans/post-implementation-reviews/2777-import-meta-hot-types.md`.
- [ ] Changeset added (patch). Changelog line: `vertz: rename \`vertz/env\` → \`vertz/client\`; fix \`ImportMeta.hot\` types (accept-callback overload, optional by design); remove \`ImportMeta.main\` from the augmentation.`
- [ ] PR body includes the Public API Changes block from §Public API Changes and `Closes #2777`.
- [ ] Full quality gates green: `vtz test && vtz run typecheck && vtz run lint`.
