# Phase 1: Fix TypeScript Stripping in Props Transform

- **Author:** belo-horizonte
- **Reviewer:** adversarial-reviewer
- **Commits:** c1f1a98db..6322840cf
- **Date:** 2026-04-04

## Changes

- `native/vertz-compiler-core/src/props_transformer.rs` (modified)
- `native/vertz-compiler-core/src/typescript_strip.rs` (modified)

## CI Status

- [x] Quality gates passed at 6322840cf

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases (should-fix items resolved)
- [x] No security issues
- [x] Public API changes match design doc (no public API change)

## Findings

### SHOULD-FIX 1: Stale test name `preserves_type_annotation_on_parameter` (RESOLVED)
Renamed to `strips_named_type_annotation_from_parameter` with negative assertions.

### SHOULD-FIX 2: Leftover `eprintln!` debug print (RESOLVED)
Removed from `test_strip_multiline_destructured_param_type`.

### OBSERVATION 1-3: Missing edge case tests (LOW RISK)
Arrow function + type, rest + type, multiline inline object type through full pipeline. Not blocking — mainline paths are well-covered.

## Resolution

Both should-fix items resolved in commit 6322840cf. Observations accepted as low-risk; mainline coverage is adequate.

**Approved.**
