# Phase 1 Review: Core Workflow — `patch`, `patch save`, `apply_patches`

**Author:** Implementation agent
**Reviewer:** Claude Opus 4.6 (adversarial review)
**Date:** 2026-03-29

## Files Reviewed

- `native/vertz-runtime/src/pm/patch.rs` (new)
- `native/vertz-runtime/src/pm/linker.rs` (modified)
- `native/vertz-runtime/src/pm/mod.rs` (modified)
- `native/vertz-runtime/src/cli.rs` (modified)
- `native/vertz-runtime/src/main.rs` (modified)
- `native/vertz-runtime/Cargo.toml` (modified)

## CI Status

- [x] Quality gates passed at 771189afa

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (missing some edge case tests)
- [ ] No type gaps or missing edge cases (nested dep check missing)
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Blocker 1 -- Custom patch application engine instead of `diffy` crate

Design doc specifies `diffy` for patch application. Custom engine was written instead (~120 lines). Issues: no `old_count` validation, fragile trailing newline handling, context lines without leading space treated as context.

**Recommendation:** Document as deliberate deviation (diffy had format incompatibility) and add edge-case tests.

### Blocker 2 -- Missing nested dependency check

Design doc specifies error for non-hoisted (nested) dependencies. Not implemented. User could patch a transitive dep that gets overwritten on next install.

### Should-fix 1 -- No test for apply_patches when patch targets a non-existent file

### Should-fix 2 -- break_hardlink always rewrites every file on non-Unix

### Should-fix 3 -- collect_files reads all files into memory (noted for future optimization)

### Should-fix 4 -- Missing CLI parsing tests for patch commands

### Should-fix 5 -- patch_save returns Err for "no changes" warning (exits 1 instead of 0)

### Should-fix 6 -- generate_diff for deleted files lacks hunk content

### Should-fix 7 -- No tests for applying patches with file additions or deletions

### Nit 1 -- Comments reference diffy but diffy is not used

### Nit 2 -- apply_patch_to_package calls break_hardlink redundantly (correct safety net)

### Nit 3 -- parse_hunk_header_old_start defaults to 1 silently on parse failure

## Resolution

Addressing all blockers and should-fix items in follow-up commit.
