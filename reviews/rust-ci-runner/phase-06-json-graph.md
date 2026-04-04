# Phase 6: JSON Output + Graph Visualization — Adversarial Review

- **Reviewer:** review-agent
- **Date:** 2026-04-04

## Findings

### [BLOCKER-1] DOT output drops isolated nodes
**File:** `native/vtz/src/ci/graph.rs:357-380`
**Status:** FIXED — added isolated node declarations after edge emission

### [BLOCKER-2] DOT output doesn't escape quotes in labels
**File:** `native/vtz/src/ci/graph.rs:364-376`
**Status:** FIXED — added `dot_escape()` helper

### [SHOULD-FIX-1] Missing `changes` section in JSON output
**Status:** DEFERRED — change detection data only available with `affected` filter. Will add conditional `changes` field in follow-up.

### [SHOULD-FIX-2] Missing `cache_time_saved_ms` in summary
**Status:** DEFERRED — requires tracking individual task durations from cache metadata.

### [SHOULD-FIX-3] Bridge leak on `TaskGraph::build` error in `run_graph`
**File:** `native/vtz/src/ci/mod.rs:461`
**Status:** FIXED — wrapped in match with bridge shutdown on error

### [SHOULD-FIX-4] Empty config produces confusing error
**File:** `native/vtz/src/ci/mod.rs:436-445`
**Status:** FIXED — early exit with clear error message

### [SHOULD-FIX-5] Non-deterministic task order in JSON
**Status:** DEFERRED — BTreeMap gives alphabetical order which is deterministic, just not execution order. Acceptable for v1.

### [NIT-1] No test for isolated nodes in DOT
**Status:** FIXED — added `to_dot_isolated_nodes_included` test

### [NIT-2] No test for quote escaping
**Status:** FIXED — added `dot_escape_handles_quotes` test

## Summary
- 2 blocker(s) — all fixed
- 5 should-fix — 2 fixed, 3 deferred
- 2 nit(s) — all fixed
