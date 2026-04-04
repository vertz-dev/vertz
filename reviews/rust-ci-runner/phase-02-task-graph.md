# Phase 2: Task Graph + Parallel Scheduler + Signal Handling

- **Author:** claude
- **Reviewer:** claude-review
- **Commits:** 02926e5ac..2ffdcbe8e
- **Date:** 2026-04-04

## Changes

- `native/vtz/src/ci/graph.rs` (new) — DAG construction from workflow config, cycle detection via Kahn's algorithm, skip propagation decision logic
- `native/vtz/src/ci/scheduler.rs` (new) — parallel work-stealing scheduler with mpsc channels, command execution with timeout, SIGINT/SIGTERM/SIGKILL signal handling
- `native/vtz/src/ci/mod.rs` (modified) — replaced sequential execution with graph+scheduler integration, added dry-run graph display

## CI Status

- [x] Quality gates passed at 2ffdcbe8e

## Review Checklist

- [x] Delivers what the ticket asks for — DAG, parallel scheduler, signal handling
- [x] TDD compliance — 23 graph tests, 8 scheduler tests
- [x] No `unsafe` without SAFETY comment
- [ ] No race conditions or deadlocks
- [ ] No resource leaks after cancellation
- [ ] Skip propagation correct for all topologies
- [ ] All edge cases handled (0 nodes, all-skip, all-fail)
- [x] No orphaned imports or dead code from old sequential execution
- [x] Public API changes match design doc

## Findings

### Verdict: Changes Requested

---

### BLOCKER-1: `propagate_completed` does not enqueue newly-ready nodes — coordinator hangs

**File:** `scheduler.rs:551-558`

`propagate_completed` only decrements in-degrees of downstream nodes. It does NOT check if any of those nodes have reached in-degree 0, and it does NOT enqueue them for execution or evaluate them for skip. This means:

When node A is skipped, `propagate_completed(A)` decrements the in-degree of A's dependents (say, node B). If B's in-degree hits 0, B is never placed on the `ready_tx` channel and never evaluated for skip/run. B remains unprocessed, `remaining` never reaches 0, and the coordinator loop at line 373 (`while remaining > 0`) hangs forever waiting on `result_rx.recv()`.

**Reproduction scenario:** A linear chain `A -> B -> C` where A fails with a Default edge. B is skipped at line 445. `propagate_completed(B)` decrements C's in-degree to 0 but never processes C. The scheduler hangs.

**Fix:** `propagate_completed` must recursively (or iteratively) handle newly-zero-in-degree nodes the same way the main coordinator loop does: evaluate should_skip, either skip+propagate or enqueue. This is essentially the same logic as lines 438-497 but applied recursively after a skip. Consider extracting a `process_ready_node` helper and calling it from both places.

---

### BLOCKER-2: PID unregister may silently fail after `child.wait()` — stale PIDs in shutdown set

**File:** `scheduler.rs:647-650`

After `child.wait().await` completes (line 634-644), `child.id()` returns `None` on many platforms because tokio clears the PID once the child is reaped. This means the unregister at line 648-649 calls `unregister_pid` with `None`, the `if let Some(pid)` guard fails, and the PID is never removed from `active_pids`.

Consequence: during shutdown, `signal_all` sends SIGTERM/SIGKILL to a PID that may now belong to a different process (PID recycling). On a busy CI machine this is a real risk.

**Fix:** Capture `child.id()` immediately after spawn (line 625) into a local variable and use that same value for both register and unregister:

```rust
let pid = child.id();
if let Some(p) = pid {
    shutdown.register_pid(p).await;
}
// ... child.wait() ...
if let Some(p) = pid {
    shutdown.unregister_pid(p).await;
}
```

---

### SHOULD-FIX-1: `should_skip_node` short-circuits on the first Skip edge — incorrect for multi-dep nodes

**File:** `scheduler.rs:520-549`

The function iterates over all reverse adjacency edges and returns `true` (skip) on the FIRST edge that produces `DepDecision::Skip`. This is wrong when a node has multiple dependencies with different edge types.

Example: Node C depends on both A (via `Default` edge) and B (via `Always` edge). A fails, B succeeds. The current logic processes A's edge first, sees `Default + Failed = Skip`, and returns `true`. But C should actually run because the `Always` edge from B says "run regardless." The `Always` edge is never evaluated.

The correct semantics should be: a node is skipped if ALL its incoming edges agree it should be skipped, OR if ANY `Default`/`Success` edge says skip AND there is no overriding `Always` edge that says run. At minimum, the function should not short-circuit on Skip — it should collect all decisions and apply a merge strategy. The design doc likely specifies the intended semantics; please verify and implement accordingly.

---

### SHOULD-FIX-2: `Ordering::Relaxed` on the cancelled flag may miss cancellation on ARM

**File:** `scheduler.rs:57-62`

`AtomicBool` with `Ordering::Relaxed` provides no cross-thread visibility guarantees. On ARM architectures (including Apple Silicon, which is likely the primary dev/CI target), a store with `Relaxed` on one thread may not be visible to a load with `Relaxed` on another thread for an unbounded time. Workers could continue picking up new tasks after cancellation.

**Fix:** Use `Ordering::SeqCst` or at minimum `Ordering::Release` for the store and `Ordering::Acquire` for the load. Since this is a cancellation flag (not a hot loop), the performance difference is negligible:

```rust
fn is_cancelled(&self) -> bool {
    self.cancelled.load(Ordering::Acquire)
}

fn cancel(&self) {
    self.cancelled.store(true, Ordering::Release);
}
```

---

### SHOULD-FIX-3: `libc::kill` cast `pid as i32` wraps on large PIDs

**File:** `scheduler.rs:79`

`pid` is `u32` (from tokio's `child.id()`). Casting `u32` to `i32` via `as` silently wraps values > `i32::MAX`. On Linux, PID max is typically 32768 or 4194304, so this is unlikely but not impossible (PID namespaces, containerized environments). If the PID wraps to a negative value, `kill(-N, sig)` sends the signal to an entire process group, which is a security issue.

**Fix:** Use `i32::try_from(pid).unwrap_or(0)` and skip the kill if conversion fails, or validate before casting.

---

### SHOULD-FIX-4: `ready_tx` not dropped on the non-cancellation exit path — workers may hang

**File:** `scheduler.rs:373-498`

The `ready_tx` sender is only dropped inside the `if shutdown.is_cancelled()` block (line 433). On the normal completion path (all nodes processed, `remaining` reaches 0), `ready_tx` is not explicitly dropped. Workers are blocked on `rx_guard.recv().await` (line 212) which will only return `None` when all senders are dropped.

The coordinator breaks out of the `while remaining > 0` loop, then aborts the signal handler, but workers may still be alive and blocked on the channel. They become zombie tokio tasks until the runtime shuts down.

**Fix:** Drop `ready_tx` after the coordinator loop exits, regardless of cancellation:

```rust
} // end of while remaining > 0

// Close the ready channel so workers can exit
drop(ready_tx);

// Cancel the signal handler
signal_handle.abort();
```

---

### SHOULD-FIX-5: Duplicate topological sort in `validate_no_cycles` + `topological_order`

**File:** `graph.rs:296-334` and `graph.rs:348-385`

`validate_no_cycles` and `topological_order` both implement identical Kahn's algorithm. The graph is validated during `build()` (line 291) and then `topological_order()` is called for dry-run (mod.rs:247). This means the identical O(V+E) traversal runs twice.

More importantly, the code is duplicated — any future fix to one must be applied to the other.

**Fix:** Remove `validate_no_cycles` and call `topological_order()` from `build()` instead. If it returns `Ok`, the graph is acyclic. Discard the ordering if not needed.

---

### NIT-1: `_is_topo` variable is unused

**File:** `graph.rs:101, 115`

`dep_tasks_to_add` collects `(String, bool)` tuples where the bool is `_is_topo`, but line 115 destructures it as `(dep_task, _)` — the topological flag is never used for the dep-task node creation. The flag is computed at line 107-108 but serves no purpose.

---

### NIT-2: `cached_count` is always 0

**File:** `scheduler.rs:169`

`let cached = 0usize;` is declared as immutable and never modified. The `SchedulerResult.cached_count` will always be 0. This is presumably a placeholder for Phase 3 (cache), but it should either be `let mut cached` with a TODO comment, or the field should be removed until caching is implemented.

---

### NIT-3: `log_initial_starts` uses `any(|_| true)` instead of `!is_empty()`

**File:** `scheduler.rs:563`

```rust
let has_deps = self.graph.reverse_adj[i].iter().any(|_| true);
```

This is a convoluted way to write `!self.graph.reverse_adj[i].is_empty()`.

---

### NIT-4: No test for the `propagate_completed` + skip chain scenario

**File:** `scheduler.rs` tests

The scheduler tests only cover command execution, env vars, timeout, and shutdown state. There are no integration tests for the actual scheduling logic: multi-node graphs, skip propagation chains, concurrent execution, or the coordinator loop. This is a significant coverage gap — the two blockers above would have been caught by a test with a 3-node chain where the middle node is skipped.

Recommended test scenarios:
- 3-node linear chain: A (fail) -> B (default dep, should skip) -> C (default dep, should skip)
- Diamond: A -> B, A -> C, B+C -> D; A fails, verify D is skipped
- Always edge: A (fail) -> B (always edge), verify B runs
- Mixed edges: A (fail) -> C (default), B (success) -> C (always); verify C runs
- 0 nodes: already covered (line 121)
- All nodes have no deps: verify all run in parallel
- Single node: verify it runs

---

### NIT-5: `graph.rs` test helper `make_result` hardcodes `exit_code: Some(0)` for all statuses

**File:** `graph.rs:896-904`

`make_result(TaskStatus::Failed)` returns `exit_code: Some(0)`, which is semantically wrong (a failed task wouldn't have exit code 0). While it doesn't affect the current tests (skip logic doesn't check exit_code), it could mask bugs if exit_code-dependent logic is added later.

## Resolution

_(To be filled after findings are addressed)_
