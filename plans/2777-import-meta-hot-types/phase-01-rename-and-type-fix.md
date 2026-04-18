# Phase 1: Rename `vertz/env` → `vertz/client` and Fix Type Shape

## Context

Issue #2777: `import.meta.hot` has no discoverable TypeScript type augmentation. The file already exists at `packages/vertz/env.d.ts` but is misnamed (`vertz/env` sounds like environment variables, not client-injected globals) and the type shape is inconsistent with how the runtime actually works.

This phase does two tightly-coupled things that must land together for CI to stay green:

1. Rename the subpath export `./env` → `./client` and the file `env.d.ts` → `client.d.ts`.
2. Fix the type shape: add `declare global { ... } export {};` wrapping, add the missing `accept(cb)` overload, remove `ImportMeta.main` (a Bun-ism not set by the vtz runtime), and update the file header comment.

The scaffold template (`packages/create-vertz-app/...`) must also be updated in the same phase because it has a test asserting `"vertz/env"` literally in its output.

See `/Users/viniciusdacal/conductor/workspaces/vertz/havana-v2/plans/2777-import-meta-hot-types.md` for the design doc.

## Tasks

### Task 1.1: Rename file, fix type shape, add type-flow test

**Files:** (4)

- `packages/vertz/env.d.ts` → `packages/vertz/client.d.ts` (renamed; full rewrite per §API Surface)
- `packages/vertz/package.json` (modified — exports + files)
- `packages/vertz/__tests__/subpath-exports.test.ts` (modified — swap `./env` assertion for `./client` + anti-regression)
- `packages/vertz/__tests__/import-meta-hot.test-d.ts` (new — type-flow proof)

**What to implement:**

1. Delete `packages/vertz/env.d.ts`.
2. Create `packages/vertz/client.d.ts` with exactly this content:

```ts
/**
 * Vertz client-side runtime type augmentations.
 *
 * Include in your tsconfig.json:
 *   "types": ["vertz/client"]
 *
 * Or add a triple-slash reference:
 *   /// <reference types="vertz/client" />
 */

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
    /** Persistent data across HMR updates. Cast to a narrower type at use site. */
    data: Record<string, unknown>;
  }

  interface ImportMeta {
    /** Hot Module Replacement API. Defined only in dev mode; undefined in production. */
    readonly hot: ImportMetaHot | undefined;
  }
}

export {};
```

   Note: `ImportMeta.main` is intentionally removed — the vtz Rust runtime never sets it; `bun-types` continues to provide it for files running under Bun.

3. Update `packages/vertz/package.json`:
   - `"files": ["dist", "env.d.ts"]` → `"files": ["dist", "client.d.ts"]`
   - `"exports"["./env"]` → `"exports"["./client"]` (keys and value paths both change: `"types": "./env.d.ts"` → `"types": "./client.d.ts"`)

4. Update `packages/vertz/__tests__/subpath-exports.test.ts`:
   - The test at lines 121-134 (`'vertz/env is a types-only export pointing to env.d.ts'`) becomes `'vertz/client is a types-only export pointing to client.d.ts'`, asserting `pkg.exports['./client']` with `types: './client.d.ts'` and no `import` field.
   - Add a new assertion in the same `describe` block: `pkg.exports['./env']` is `undefined` — anti-regression against accidental re-addition.
   - Update the pre-existing comment at line 98 (`// Types-only exports (e.g., ./env) have no import field`) to reference `./client` instead.

5. Create `packages/vertz/__tests__/import-meta-hot.test-d.ts` with this content:

```ts
/// <reference types="vertz/client" />
import { expectTypeOf, it } from '@vertz/test';

it('ImportMeta.hot is optional (undefined in prod, defined in dev)', () => {
  expectTypeOf(import.meta.hot).toEqualTypeOf<ImportMetaHot | undefined>();
});

it('ImportMetaHot has accept/dispose/data', () => {
  expectTypeOf<ImportMetaHot>().toHaveProperty('accept');
  expectTypeOf<ImportMetaHot>().toHaveProperty('dispose');
  expectTypeOf<ImportMetaHot>().toHaveProperty('data');
});

it('accept has three overloads: no-arg, callback-only, deps+callback', () => {
  import.meta.hot?.accept();
  import.meta.hot?.accept(() => {});
  import.meta.hot?.accept('./dep', (mods) => mods);
  import.meta.hot?.accept(['./a', './b'], (mods) => mods);
});

it('dispose receives a mutable data record', () => {
  import.meta.hot?.dispose((data) => {
    data.count = 1;
  });
  const _previous: unknown = import.meta.hot?.data.count;
});

it('rejects unknown methods', () => {
  // @ts-expect-error — no invalidate() method (tracked in follow-up)
  import.meta.hot?.invalidate();
});

it('rejects a bare string to accept without a callback tuple', () => {
  // @ts-expect-error — single-string accept is not a valid overload
  import.meta.hot?.accept('dep-only-no-callback');
});
```

**Acceptance criteria:**

- [ ] `packages/vertz/client.d.ts` exists; `env.d.ts` does not.
- [ ] `packages/vertz/package.json` has `"./client"` export and no `"./env"` export; `files` array lists `client.d.ts`.
- [ ] `subpath-exports.test.ts` asserts `./client` exists AND asserts `./env` is undefined.
- [ ] `import-meta-hot.test-d.ts` typechecks under strict mode with `vertz/client` in `types`.
- [ ] TDD: the type-flow test is written first (Red when `accept(cb)` overload is absent or when `main` is still on `ImportMeta`), then the `.d.ts` is rewritten until it's Green.
- [ ] Quality gates pass: `vtz test && vtz run typecheck && vtz run lint` (full monorepo).

---

### Task 1.2: Update scaffold template to emit `vertz/client` and `?.` call sites

**Files:** (3)

- `packages/create-vertz-app/src/templates/index.ts` (modified — tsconfig + entry-client templates)
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` (modified — updated assertions)
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts` (modified — updated assertions)

**What to implement:**

1. In `packages/create-vertz-app/src/templates/index.ts`:
   - Line 650: change `types: ['vertz/env']` → `types: ['vertz/client']`.
   - Line 887 (the `entry-client.ts` template): change the emitted line `import.meta.hot.accept();` → `import.meta.hot?.accept();`.

2. In `packages/create-vertz-app/src/templates/__tests__/templates.test.ts`:
   - Any test asserting `'vertz/env'` in the scaffolded tsconfig string now asserts `'vertz/client'`.
   - Line 301 (`expect(entryClientTemplate()).toContain('import.meta.hot.accept()')`) becomes `toContain('import.meta.hot?.accept()')`.

3. In `packages/create-vertz-app/src/__tests__/scaffold.test.ts`:
   - Any test asserting `'vertz/env'` now asserts `'vertz/client'`.
   - Line 294 (`expect(content).toContain('import.meta.hot.accept()')`) becomes `toContain('import.meta.hot?.accept()')`.

**Acceptance criteria:**

- [ ] Scaffold output contains `"types": ["vertz/client"]` (not `vertz/env`).
- [ ] Scaffold `entry-client.ts` uses `import.meta.hot?.accept()` (optional chain).
- [ ] Template and scaffold tests assert the new strings; they fail if the code regresses.
- [ ] TDD: update the tests first (Red), then update `index.ts` (Green).
- [ ] Quality gates pass on the full monorepo: `vtz test && vtz run typecheck && vtz run lint`.

---

## Review

After both tasks are implemented and green, spawn an adversarial review agent. The review checks:

- Type shape matches the design doc exactly (no extra properties, no missing overloads, correct optionality).
- `declare global { ... } export {};` wrapping is present — verify by adding a dummy `import type` to `client.d.ts` in a scratch branch and confirming the augmentation still applies (then revert).
- All scaffold-generated files compile under `moduleResolution: "bundler"` and `strict: true`.
- `vertz/env` appears nowhere in the source tree (grep).
- TDD compliance — tests were red first, then made green. Git log in the phase branch should show test commits before implementation commits, or interleaved.

Review file: `reviews/2777-import-meta-hot-types/phase-01-rename-and-type-fix.md`.
