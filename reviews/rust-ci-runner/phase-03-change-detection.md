# Phase 3: Change Detection + Affected Filtering

- **Author:** claude
- **Reviewer:** claude-review
- **Commits:** 7117bd78c..da1f4a33a
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/ci/changes.rs` (new) — Git change detection, file-to-package mapping, transitive affected calculation, condition evaluation
- `native/vtz/src/ci/graph.rs` (modified) — Added `filter_packages` parameter to `TaskGraph::build`, restricts package-scoped nodes to filtered set
- `native/vtz/src/ci/mod.rs` (modified) — Wired `Affected` CLI subcommand, `WorkflowFilter::Affected` integration, `--all`/`--scope` CLI overrides

## CI Status

- [x] Quality gates passed at da1f4a33a

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [ ] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Verdict: Changes Requested

---

### BLOCKER-1: Dep-task nodes for non-workflow tasks ignore `filter_packages`

**File:** `graph.rs:139-151`

Dep tasks not in `workflow.run` iterate `workspace.packages.keys()` instead of `active_packages`, creating nodes for filtered-out packages.

**Fix:** Use `active_packages` for dep task node creation.

---

### SHOULD-FIX-1: Root changes + empty affected = silent skip

Add diagnostic log when root files change but no packages affected.

### SHOULD-FIX-2: Invalid glob patterns silently ignored in condition evaluation

Log a warning when `glob::Pattern::new()` fails.

### SHOULD-FIX-3: `std::env::set_var` in tests is unsound

Refactor `evaluate_condition` to accept env lookup function.

### SHOULD-FIX-4: `CI` env var only matches `"true"`

Check for non-empty presence, not just `"true"`.

### SHOULD-FIX-5: Task-level `cond` not integrated into scheduler

Wire condition evaluation before task execution.

### SHOULD-FIX-6: `--base` not threaded through for affected workflows

Thread base parameter to `run_task_or_workflow`.

---

### NIT-1: Redundant exact match fallback in Branch condition
### NIT-2: `parse_file_list` trims whitespace unnecessarily
### NIT-3: Missing glob pattern tests
### NIT-4: BTreeMap for reverse_deps unnecessary

## Resolution

_(To be filled after findings are addressed)_
