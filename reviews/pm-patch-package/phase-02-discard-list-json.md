# Phase 2 Review: Discard, List, JSON Output

**Author:** Implementation agent
**Reviewer:** Claude Opus 4.6 (adversarial review)
**Date:** 2026-03-29

## Files Reviewed

- `native/vertz-runtime/src/pm/patch.rs` (modified)
- `native/vertz-runtime/src/main.rs` (modified)
- `native/vertz-runtime/src/cli.rs` (modified)

## CI Status

- [x] Quality gates passed (cargo test, clippy, fmt)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings (from initial review)

### Blocker 1 -- Missing `version` field in `patch list --json` saved entries
**Status:** Fixed. Extracted version from key string in main.rs JSON output.

### Blocker 2 -- Undocumented `patch_list_empty` event in JSON output
**Status:** Fixed. Removed the event; zero NDJSON lines = no results.

### Should-fix 1 -- Undocumented `reapplied` field in JSON discard output
**Status:** Fixed. Removed the field from JSON output.

### Should-fix 2 -- `PatchDiscardResult` missing `patch_path` field
**Status:** Fixed. Added `patch_path: Option<String>` to result struct, populated from `patch_discard()`, used in main.rs text output.

### Should-fix 3 -- Distinguish context mismatch from genuine errors in discard re-apply
**Status:** Accepted as-is. The `.is_ok()` pattern is correct — both context mismatch (backup already patched) and genuine apply failure are non-fatal during discard. The backup state is always correct.

### Should-fix 4 -- Missing `#[derive(Debug)]` on `PatchListResult`
**Status:** Fixed.

### Should-fix 5 -- Test for exact error message when backup doesn't exist
**Status:** Already covered by `test_patch_discard_not_being_patched`.

### Should-fix 6 -- `patch_list` version fallback when package not in node_modules
**Status:** Fixed. Added `get_version_from_dir()` helper that reads version from backup directory's package.json. Added test `test_patch_list_active_falls_back_to_backup_version`.

## Resolution

All blockers and should-fix items addressed. 18 patch tests passing. No remaining findings.
