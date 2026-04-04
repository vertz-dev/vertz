# CI: `rootAffectsAll` Workflow Option

**Issue:** #2271
**Status:** Approved (DX ✓, Product ✓, Technical ✓)

## Problem

When only root files change (e.g., `bun.lock`, `ci.config.ts`, `tsconfig.base.json`), `affected.all_affected` is empty but `affected.root_changed` is true. The current behavior passes `Some(empty_set)` to `graph.build`, meaning ALL package-scoped tasks are excluded — only root-scoped tasks run.

A "root file" is any changed file that does not reside inside a workspace package directory. This includes lockfiles, root-level config files, CI config, README, etc.

This is correct for some workflows (e.g., formatting checks that run at root), but surprising for others. A lockfile change (`bun.lock`) affects every package's dependency resolution, so users may want all package tasks to run in that case.

A diagnostic log was already added (#2270) to explain this behavior. This design adds a configurable escape hatch.

## API Surface

### TypeScript (`ci.config.ts`)

```ts
import { pipe, task } from '@vertz/ci';

export default pipe({
  tasks: {
    build: task({ command: 'bun run build' }),
    test: task({ command: 'bun test', deps: ['build'] }),
    lint: task({ command: 'oxlint .', scope: 'root' }),
  },
  workflows: {
    ci: {
      run: ['lint', 'build', 'test'],
      filter: 'affected',
      rootAffectsAll: true, // <-- NEW: root changes trigger all packages
    },
  },
});
```

### Type Definition

```ts
export interface WorkflowConfig {
  run: string[];
  filter?: WorkflowFilter;
  env?: Record<string, string>;
  /**
   * When `filter: 'affected'` and only root-level files changed (files outside
   * any workspace package directory, e.g. `bun.lock`, `tsconfig.base.json`),
   * treat all workspace packages as affected instead of running only root-scoped
   * tasks.
   *
   * Has no effect when `filter` is `'all'` or an explicit package list.
   *
   * @default false
   */
  rootAffectsAll?: boolean;
}
```

### Behavior

| `filter` | `rootAffectsAll` | Root files changed | Packages affected | Result |
|----------|------------------|--------------------|-------------------|--------|
| `'affected'` | `false` (default) | Yes | None | Only root-scoped tasks run (current behavior) |
| `'affected'` | `true` | Yes | None | All packages treated as affected |
| `'affected'` | `true` | Yes | Some | Normal affected set used (flag is a no-op) |
| `'affected'` | `true` | No | Any | Normal affected detection (flag is a no-op) |
| `'all'` | any | any | any | All packages always (no change) |
| `string[]` | any | any | any | Explicit packages always (no change) |

When `filter` is `'all'` or an explicit package list, `rootAffectsAll` has no effect.

### Diagnostic Log Update

When `rootAffectsAll: true` activates:
```
[pipe] Root files changed — rootAffectsAll enabled, treating all N packages as affected
```

When `rootAffectsAll: false` (default, existing):
```
[pipe] Root files changed but no packages affected — only root-scoped tasks will run
```

## Manifesto Alignment

- **Principle: Convention over configuration** — The default (`false`) preserves current behavior and backward compatibility. Existing users' CI pipelines are unaffected. The option is opt-in.
- **Principle: Explicit > implicit** — Rather than guessing which root files "should" affect packages, we let the user decide explicitly.

## Non-Goals

- Per-file root-change rules (e.g., "bun.lock affects all but .editorconfig doesn't"). That's a separate, more complex feature. Users who need per-file control can use `cond.changed(...)` on individual tasks today.
- Changing the default behavior. This is purely additive and opt-in.

## Unknowns

None identified. The implementation is straightforward — a single boolean check in the existing affected-detection branch.

## Type Flow Map

`rootAffectsAll: boolean` flows:
1. User writes `rootAffectsAll: true` in `ci.config.ts` → `WorkflowConfig` type
2. `pipe()` passes it through unchanged (no callback registration needed)
3. Rust deserializes `WorkflowConfig.root_affects_all` via serde (requires `#[serde(rename = "rootAffectsAll")]`)
4. `run_task_or_workflow()` checks the flag when `filter: Affected` and `root_changed && all_affected.is_empty()`

No generics involved — this is a plain boolean.

## Implementation Notes (from technical review)

1. **Serde rename required:** `WorkflowConfig` does not have `rename_all = "camelCase"`. The new field needs `#[serde(rename = "rootAffectsAll")]` to match the camelCase JSON key from the TS config bridge.
2. **Synthetic WorkflowConfig:** Two struct literal sites in `mod.rs` (lines ~178 and ~453) construct `WorkflowConfig` directly and must include `root_affects_all: false`.
3. **Extract filter resolution (optional):** Consider extracting the filter resolution logic (lines 199-248 of `mod.rs`) into a standalone function for easier unit testing.

## E2E Acceptance Test

```ts
describe('Given a workflow with rootAffectsAll: true', () => {
  describe('When only root files change', () => {
    it('Then all packages are treated as affected', () => {
      // filter_packages should be None (all packages)
    });
    it('Then the diagnostic log includes package count', () => {
      // stderr contains "rootAffectsAll enabled, treating all N packages as affected"
    });
  });

  describe('When root files AND package files change', () => {
    it('Then normal affected set is used (flag is a no-op)', () => {
      // all_affected is non-empty, so rootAffectsAll branch is not entered
    });
  });

  describe('When rootAffectsAll is false (default)', () => {
    it('Then only root-scoped tasks run when root files change', () => {
      // existing behavior preserved
    });
  });
});
```

## Implementation Plan

### Phase 1: Types + Deserialization + Logic

**Files (5):**
1. `native/vtz/src/ci/types.rs` — Add `root_affects_all: bool` to `WorkflowConfig` with serde rename
2. `native/vtz/src/ci/mod.rs` — Check flag in affected branch, adjust filter_packages, update synthetic structs
3. `packages/ci/src/types.ts` — Add `rootAffectsAll?: boolean` to `WorkflowConfig` with JSDoc
4. `packages/ci/src/types.test-d.ts` — Type tests for new option
5. `packages/ci/src/__tests__/builders.test.ts` — Builder passthrough test

**Acceptance criteria:**
- [ ] `root_affects_all` deserializes from JSON with camelCase key (Rust unit test)
- [ ] `root_affects_all` defaults to `false` when omitted (Rust unit test)
- [ ] When `root_affects_all: true` and root changed with empty affected set → `filter_packages = None` (all packages)
- [ ] When `root_affects_all: false` and root changed → existing behavior (empty set)
- [ ] When `root_affects_all: true` and packages already affected → normal affected set (no-op)
- [ ] Updated diagnostic log message with package count when flag activates
- [ ] TS type accepts `rootAffectsAll?: boolean` on `WorkflowConfig`
- [ ] TS type test validates the option
- [ ] Synthetic WorkflowConfig literals updated
