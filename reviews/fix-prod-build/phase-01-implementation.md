# Phase 1: Fix Production Build Pipeline

- **Author:** fix-prod-build implementor
- **Reviewer:** Claude Opus 4.6 (adversarial review)
- **Commits:** 34c297e15..f44515e2f
- **Date:** 2026-04-16

## Changes

- `native/vertz-compiler/package.json` (modified)
- `native/vertz-compiler/postinstall.cjs` (new)
- `packages/native-compiler-darwin-arm64/package.json` (new)
- `packages/native-compiler-darwin-x64/package.json` (new)
- `packages/native-compiler-linux-arm64/package.json` (new)
- `packages/native-compiler-linux-x64/package.json` (new)
- `packages/runtime/package.json` (modified)
- `packages/cli/package.json` (modified)
- `packages/cli/src/commands/create.ts` (modified)
- `packages/cli/src/production-build/ui-build-pipeline.ts` (modified)
- `packages/cli/src/production-build/__tests__/ui-build-pipeline.test.ts` (modified)
- `packages/ui-server/package.json` (modified)
- `.github/workflows/release.yml` (modified)
- `scripts/version.sh` (modified)
- `scripts/publish.sh` (modified)
- `.changeset/fix-prod-build-pipeline.md` (new)

## CI Status

- [x] Lint passed (oxlint)
- [x] Rust tests passed (cargo test --all)
- [x] Rust clippy passed
- [x] Rust fmt passed

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (failure-path test added after review)
- [x] No type gaps or missing edge cases (after review fixes)
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER 1: publish.sh Phase 3 double-publish (RESOLVED)

Phase 3 glob matched native-compiler-* after Phase 1.5 removed the `private` flag.
**Fix:** Added `native-compiler-*` to the basename skip filter in Phase 3.

### BLOCKER 2: postinstall.cjs stale binary on upgrade (RESOLVED)

`!fs.existsSync(dest)` guard prevented overwriting old binaries on upgrade.
**Fix:** Removed the guard — always overwrite when source exists.

### SHOULD-FIX: Missing failure-path test for buildUI guard (RESOLVED)

Added test verifying `loadNativeCompiler()` throw returns `{ success: false, error: '...', durationMs: 0 }`.

### SHOULD-FIX: No compiler binary verification in CI (RESOLVED)

Added `Verify compiler binary exists` step after copy, before code signing and upload.

### SHOULD-FIX: Changeset missing @vertz/native-compiler (NOT AN ISSUE)

Verified `@vertz/native-compiler` is not published on npm at all — version 0.2.65 is safe.
`version.sh` handles syncing from the core package version, so changeset coverage is not needed.

### NITPICK: create.ts mixes vtz and vertz (ACKNOWLEDGED)

`vtz install` + `vertz dev` reflects the actual command split: `vtz` is the native runtime
(install, test), `vertz` is the JS CLI (dev, build, create). Left as-is — both are correct.

### NITPICK: postinstall.cjs maps win32 to linux silently (ACKNOWLEDGED)

Windows is not supported. The try/catch will swallow the error. Low priority.

## Resolution

All blocker and should-fix findings addressed. Approved.
