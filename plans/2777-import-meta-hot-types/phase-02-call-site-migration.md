# Phase 2: Migrate User-Facing Call Sites to `import.meta.hot?.accept()`

## Context

Phase 1 renamed `vertz/env` → `vertz/client` and fixed the type shape. `ImportMeta.hot` is now `ImportMetaHot | undefined`, matching what the Bun build plugin literally emits (`if (import.meta.hot) import.meta.hot.accept();` — `plugin.ts:488`). Every user-facing call site that uses `import.meta.hot.*` without a guard must switch to optional chaining.

Framework-internal files that rely on Bun's static analysis of `if (import.meta.hot)` guards **stay non-optional** — Bun's analysis cannot see through `?.`. Those are out of scope for this phase:

- `packages/ui-server/src/build-plugin/plugin.ts:488` — Bun-injected (keep as-is).
- `packages/ui-server/src/build-plugin/fast-refresh-runtime.ts:27` — Bun-analyzed `if` guard (keep as-is).
- `poc/ssr-hmr/client.tsx:21-28` — uses an `if` guard (keep as-is).

User-facing files (landing page, component-docs site, examples) that currently call `import.meta.hot.accept()` with neither a guard nor `?.` migrate to `?.`.

See `/Users/viniciusdacal/conductor/workspaces/vertz/havana-v2/plans/2777-import-meta-hot-types.md`.

## Tasks

### Task 2.1: Migrate framework apps (landing + component-docs)

**Files:** (2)

- `packages/landing/src/entry-client.ts` (modified)
- `packages/component-docs/src/entry-client.ts` (modified)

**What to implement:**

1. In both files, change `import.meta.hot.accept();` → `import.meta.hot?.accept();`.

2. Add `"vertz/client"` to each package's `tsconfig.json` `types` array if it isn't already there. If their tsconfig extends a parent that includes it, no change needed — verify first with `cat`.

**Acceptance criteria:**

- [ ] Both files use `import.meta.hot?.accept()`.
- [ ] `vtz run typecheck` on both packages is clean under strict mode.
- [ ] The runtime behavior is unchanged — the Bun build plugin still injects its own `if (import.meta.hot) import.meta.hot.accept()` after user code.
- [ ] TDD approach: there is no behavioral change, so no new unit test is required. The existing typecheck gate IS the test — it proves the user-facing code type-checks under the new augmentation.
- [ ] Quality gates pass.

---

### Task 2.2: Migrate examples batch A (task-manager + linear)

**Files:** (4)

- `examples/task-manager/tsconfig.json` (modified — add `vertz/client` to `types`)
- `examples/task-manager/src/entry-client.ts` (modified — `?.`)
- `examples/linear/tsconfig.json` (modified — add `vertz/client` to `types`)
- `examples/linear/src/entry-client.ts` (modified — `?.`)

**What to implement:**

1. `examples/task-manager/tsconfig.json`: change `"types": ["bun-types"]` → `"types": ["bun-types", "vertz/client"]`. Keep `bun-types` — some example files use `import.meta.main` and `Bun.serve`.

2. `examples/task-manager/src/entry-client.ts:15`: `import.meta.hot.accept();` → `import.meta.hot?.accept();`.

3. `examples/linear/tsconfig.json`: change `"types": ["bun-types"]` → `"types": ["bun-types", "vertz/client"]`.

4. `examples/linear/src/entry-client.ts:12`: `import.meta.hot.accept();` → `import.meta.hot?.accept();`.

**Acceptance criteria:**

- [ ] Both example tsconfigs include `"vertz/client"` in their `types` array.
- [ ] Both entry-client files use `?.`.
- [ ] `vtz run typecheck` is clean for both example packages under strict mode.
- [ ] Removing `"vertz/client"` from a tsconfig (scratch test) produces TS2339 on `hot` — proof that the augmentation is what makes it compile.
- [ ] Quality gates pass.

---

### Task 2.3: Migrate examples batch B (entity-todo + contacts-api)

**Files:** (3)

- `examples/entity-todo/tsconfig.json` (modified — add `vertz/client`)
- `examples/entity-todo/src/entry-client.ts` (modified — `?.`)
- `examples/contacts-api/tsconfig.json` (modified — add `vertz/client`)

**What to implement:**

1. `examples/entity-todo/tsconfig.json`: change `"types": ["bun-types", "@cloudflare/workers-types"]` → `"types": ["bun-types", "@cloudflare/workers-types", "vertz/client"]`.

2. `examples/entity-todo/src/entry-client.ts:14`: `import.meta.hot.accept();` → `import.meta.hot?.accept();`.

3. `examples/contacts-api/tsconfig.json`: change `"types": ["bun-types"]` → `"types": ["bun-types", "vertz/client"]`. Note: this example has no `entry-client.ts`, but we add `vertz/client` for consistency so the example is ready when a client is added.

**Acceptance criteria:**

- [ ] Both example tsconfigs include `"vertz/client"`.
- [ ] `entity-todo/src/entry-client.ts` uses `?.`.
- [ ] `vtz run typecheck` is clean for both.
- [ ] Quality gates pass.

---

## Review

After Phase 2 is green, spawn one adversarial review agent. The review checks:

- Every `import.meta.hot.*` occurrence in the repo is either (a) using `?.`, (b) inside an `if (import.meta.hot)` guard, or (c) one of the three whitelisted framework-internal files documented above.
- All four example tsconfigs now include `"vertz/client"`.
- The existing `bun-types` in example tsconfigs is retained — removing it would break `Bun.serve` etc. typing.
- No other `.d.ts` files in the repo silently redeclare `ImportMeta.hot` with a different shape (`grep -rn "hot:" packages/*/src/**/*.d.ts` and similar).
- `vtz run typecheck` is clean across the whole monorepo.

Review file: `reviews/2777-import-meta-hot-types/phase-02-call-site-migration.md`.
