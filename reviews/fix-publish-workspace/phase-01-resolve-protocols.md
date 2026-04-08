# Phase 1: Resolve workspace protocols in vtz publish

- **Author:** guangzhou-v1
- **Reviewer:** Claude Opus 4.6
- **Date:** 2026-04-07

## Changes

- `native/vtz/src/pm/pack.rs` (modified) — Added `resolve_workspace_protocols()`, updated `pack_tarball()` with `pkg_json_override` parameter
- `native/vtz/src/pm/workspace.rs` (modified) — Added `find_workspace_root()` and `build_workspace_version_map()`
- `native/vtz/src/pm/mod.rs` (modified) — Wired workspace discovery and protocol resolution into `publish()`

## CI Status

- [x] Quality gates passed — cargo test (3020 pass), clippy clean, fmt clean

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (11 new tests)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc (N/A — internal fix)

## Findings

### Round 1

| Finding | Severity | Resolution |
|---------|----------|------------|
| Lifecycle scripts run AFTER raw_pkg read; script mods lost | BLOCKER | Fixed: moved read after lifecycle scripts |
| build_workspace_version_map errors silently swallowed | SHOULD-FIX | Fixed: now returns error to caller |
| unpacked_size incorrect when override used | SHOULD-FIX | Fixed: compute from actual content lengths |
| devDependencies not resolved in tarball | SHOULD-FIX | Fixed: added devDependencies to dep_fields |
| find_workspace_root walks to filesystem root | LOW | Accepted: matches npm behavior |
| workspace: (empty) produces empty string | NIT | Accepted: edge case, matches npm/pnpm |

## Resolution

All blocker and should-fix findings addressed. Quality gates re-run and passing.
