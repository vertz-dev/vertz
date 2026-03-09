# Retrospective — Access Redesign

## What went well

1. **Parallel phase execution saved significant time.** Phases 3, 4, 5, and 7 were developed simultaneously in separate git worktrees. The dependency graph (Phase 2 → Phases 3/4/7 in parallel → Phase 5) was correctly identified and exploited.

2. **Entity-centric API is a major DX win.** Moving from flat `roles` + `inherits` to `entities: { project: { roles: [...], inherits: 'organization:member' } }` makes the hierarchy self-documenting. Validation rules catch typos at definition time rather than at runtime.

3. **21 validation rules catch real mistakes.** Duplicate role detection, circular inheritance detection, dangling entity references, limit scope validation — these all fire at `defineAccess()` time with clear error messages.

4. **Plan versioning with SHA-256 hashing is deterministic.** Canonical JSON serialization ensures the same plan config always produces the same hash, making version detection reliable across restarts.

5. **Multi-limit resolution handles real-world scenarios.** Multiple limits gating the same entitlement (e.g., global + per-entity) all must pass — this matches how SaaS billing actually works.

## What went wrong

1. **Phase branch merges were painful.** Parallel development in worktrees created significant merge conflicts when consolidating into the feature branch. Phase 4 was merged first, then Phases 3, 5, 7 all conflicted with the Phase 4 additions (especially in `access-context.ts` and `define-access.ts`).

2. **Export chain gaps.** Phase 4 exports were added to `auth/index.ts` but not to `src/index.ts`, causing integration tests to fail at runtime. This happened because the implementation agent didn't verify the full export chain from source → barrel → package entry point.

3. **Phase PRs added overhead without benefit.** The initial approach of creating GitHub PRs per phase (into the feature branch) was slower than needed. The local phase workflow (commits on branch + local review files) would have been more efficient.

4. **Adversarial reviews were initially skipped.** Implementation agents reported completing reviews but didn't actually spawn the 4 reviewer sub-agents. Had to be caught and corrected manually.

5. **`OverageConfig` type missing from versioned limit annotations.** When Phase 3 (overrides + overage) and Phase 4 (versioning) merged, the versioned limit type didn't include the `overage` property from Phase 3, causing TypeScript errors that required a post-merge fix.

## How to avoid it

1. **Verify full export chain in a single test.** After adding any new export to a sub-module, immediately verify it's accessible from the package's public entry point (`import { X } from '@vertz/server'`). Add this as a TDD step.

2. **Use local phase workflow from the start.** Don't create GitHub PRs per phase — use the local phase workflow with commits on the feature branch and markdown review files.

3. **When developing parallel phases, designate a "base" phase.** The phase that modifies the most shared files should merge first. Other phases should rebase onto it before merging.

4. **Embed adversarial review spawning in the agent prompt.** The implementation agent prompt must explicitly include the 4 reviewer sub-agent spawning step with the persona names. Don't rely on the agent knowing the process.

## Process changes adopted

1. **Export chain verification** — Add `import { NewExport } from '@vertz/server'` to integration test immediately after adding any new export.
2. **Merge order documentation** — When running parallel phases, document the merge order in the design doc's dependency graph.
3. **Adversarial review prompt template** — Always include explicit sub-agent names (ben, nora, ava, mike) and file paths in implementation agent prompts.
