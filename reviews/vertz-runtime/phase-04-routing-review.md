# Phase 4: Route Resolution + Bus Wiring — Adversarial Review

- **Author:** implementation agent
- **Reviewer:** adversarial review agent (Claude Sonnet 4.6)
- **Date:** 2026-04-05

## Changes

- `native/vtz/src/runtime/isolate_supervisor.rs` (modified — routing methods)
- `native/vtz/tests/http_multi_isolate.rs` (new — integration tests)

## CI Status

- [x] Quality gates passed after fixes

## Findings

### BLOCKER-1: singularize fails on common irregular plurals
`singularize("categories")` → `"categorie"` instead of `"category"`.
**Resolution:** Expanded singularize to handle: -ies→-y, -sses→strip -es, -ses→strip -es, -xes/-ches/-shes/-zes→strip -es. Added comprehensive tests.

### BLOCKER-2: isolates_have_thread_ids asserts wrong invariant
Asserted `thread_id < num_cpus()` instead of `thread_id < isolate_count`.
**Resolution:** Fixed to assert `thread_id < supervisor.isolate_count()`.

### SHOULD-FIX-1: entity_to_isolate_map leaks internal type
Exposed `&HashMap<String, usize>` in public API.
**Resolution:** Removed. `create_message_bus()` covers the use case.

### SHOULD-FIX-2: Response channels immediately dropped
Integration tests only test message delivery, not response handling.
**Resolution:** Added NOTE in file docstring explaining response handling is future work (V8 handler). Added trace_id assertions.

### SHOULD-FIX-3: strict_serialization not enforced in send path
Flag is advisory metadata for routing layer (not yet implemented).
**Resolution:** Documented this explicitly in the test comment.

### SHOULD-FIX-4: Redundant isolates.get() for guaranteed-valid index
**Resolution:** Changed to direct index `self.isolates[isolate_idx]` with invariant comment.

### NIT-3: trace_id not asserted
**Resolution:** Added trace_id assertions in integration tests.

### NIT-4: extract_entity_from_path unnecessarily pub
**Resolution:** Changed to `pub(crate)`.

## Resolution

All 2 blockers and 4 should-fixes resolved. Tests expanded to 26 unit + 5 integration.
