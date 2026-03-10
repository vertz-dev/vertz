# Phase 3: Dependencies And Docs

- **Author:** Codex
- **Reviewer:** Codex-Adversarial
- **Commits:** working tree (uncommitted)
- **Date:** 2026-03-10

## Changes

- `package.json` (modified)
- `bun.lock` (modified)
- `packages/ui-server/package.json` (modified)
- `docs/guides/authentication.md` (modified)
- `packages/docs/guides/ui/auth.mdx` (modified)
- `packages/docs/guides/server/auth.mdx` (modified)

## CI Status

- [ ] `dagger call ci` passed
- Attempted locally, but Dagger could not start because Docker was unavailable at `/Users/viniciusdacal/.docker/run/docker.sock`.
- Verification passed:
  - [x] `bun audit`
  - [x] `bun run --filter @vertz/ui-server test`

## Review Checklist

- [x] Delivers the intended dependency and documentation hardening
- [x] Security advisories are cleared from the lockfile
- [x] No new test regressions in `@vertz/ui-server`
- [x] Documentation matches the hardened signup behavior
- [x] Public API notes match the design plan

## Findings

### Approved

- The lockfile now resolves `happy-dom` to 20.x everywhere and forces the Vitest/Vite subtree onto non-vulnerable `vite` and `rollup` versions.
- `bun audit` reports no remaining vulnerabilities.
- Documentation no longer suggests that `signUp()` can assign roles or other reserved auth fields.

### Residual risk

- The repository-level lint script still fails on unrelated existing `packages/cli` issues, so there is no fully green monorepo lint signal in this workspace.

## Resolution

No phase-specific issues remained after the dependency graph and docs were updated.
