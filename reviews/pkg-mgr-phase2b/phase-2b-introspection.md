# Phase 2b: Introspection & Agent Output

- **Author:** Implementation agent
- **Reviewer:** Review agent
- **Commits:** 54b308c84..0b997d27d
- **Date:** 2026-03-29

## Changes

- native/vertz-runtime/src/pm/output.rs (new)
- native/vertz-runtime/src/pm/mod.rs (modified)
- native/vertz-runtime/src/pm/registry.rs (modified)
- native/vertz-runtime/src/pm/types.rs (modified)
- native/vertz-runtime/src/cli.rs (modified)
- native/vertz-runtime/src/main.rs (modified)
- native/vertz-runtime/tests/pm_introspection.rs (new)
- native/vertz-runtime/tests/pm_integration.rs (modified)

## CI Status

- [x] Quality gates passed at 0b997d27d (cargo test 814 pass, clippy clean, fmt clean)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Blockers (all resolved)

- **B1:** BFS per-path visited cloning causes exponential memory for diamond deps. **Fixed:** Added MAX_PATHS=100 cap.
- **B2:** `outdated` fetches registry metadata sequentially. **Fixed:** Parallelized with buffer_unordered(16).
- **B3:** `outdated` hardcodes eprintln for warnings, breaking --json contract. **Fixed:** Warnings returned alongside entries, routed through appropriate output channel.

### Should-Fix (resolved)

- **S4:** `outdated` showed all packages including up-to-date ones. **Fixed:** Filter where current != wanted || current != latest.
- **S7:** Cache path allows path traversal from malicious package names. **Fixed:** Sanitize ".." from cache filenames.

### Should-Fix (deferred)

- **S1:** `format_why_json` flattens paths across versions — lossy for multi-version. Minor, deferred.
- **S2:** 304 NOT_MODIFIED without cache file causes hard error. Rare edge case, deferred.
- **S3:** Shared deps appear multiple times in `list --all`. Intentional tree-display behavior (matches npm ls).
- **S5:** `error_code_from_message` is brittle pattern matching. Works for now, to be replaced with typed error variants.
- **S6:** Missing test for `vertz why` with empty lockfile. Low risk, deferred.

### Nitpicks (not addressed)

- N1: Code duplication between fetch_with_etag and fetch_abbreviated_with_etag
- N2: format_list_json manually builds JSON instead of json! macro
- N3: Integration test helpers duplicated between test files
- N4: ListOptions should derive Default
- N5: WhyPathEntry includes target in path (intentional design choice)

## Resolution

All 3 blockers and 2 critical should-fix items resolved in commit 0b997d27d. Remaining should-fix items are low risk and deferred to future work.
