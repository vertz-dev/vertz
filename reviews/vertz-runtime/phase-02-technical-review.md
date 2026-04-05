# Technical Review: Vertz Runtime Phase 2 — Multi-Isolate Entity Workers + Message Bus

- **Author:** Design team
- **Reviewer:** Technical review agent
- **Date:** 2026-04-05
- **Document:** `plans/vertz-runtime.md` Rev 2.1
- **Scope:** Phase 2 architecture (multi-isolate, message bus, entity grouping, durable state, cooperative scheduling)

---

## Verdict: Changes Requested

The design is architecturally sound and well-motivated. The phased gating strategy is excellent — Phase 0 as a standalone learning vehicle with kill criteria is the right call. However, there are **2 blockers** and **8 should-fix** items that need resolution before implementation begins.

---

## Finding 1: `deno_core::JsRuntime` is `!Send` — cooperative scheduling on shared threads requires a fundamentally different approach (BLOCKER)

### The Problem

The design proposes N:M cooperative scheduling: a pool of N worker threads multiplexing M Isolates, where multiple Isolates are pinned to the same thread and cooperatively scheduled when one yields.

`deno_core::JsRuntime` contains `Rc<VertzModuleLoader>` (visible at `js_runtime.rs:86`) and internally uses `Rc<RefCell<...>>` extensively. This makes `JsRuntime` `!Send` and `!Sync`. Once created on a thread, a `JsRuntime` can never move to another thread.

The existing codebase already works within this constraint:
- `PersistentIsolate` (`persistent_isolate.rs:161`) spawns a dedicated OS thread with `std::thread::spawn` and creates the `JsRuntime` inside that thread's closure.
- The test runner (`runner.rs:357`) spawns one OS thread per worker, each creating its own `JsRuntime`.

The design's N:M model says: "Isolates on the same thread are cooperatively scheduled: when one yields (awaiting I/O, message bus, etc.), the next Isolate on that thread runs." This is feasible, but the cooperative scheduling mechanism is underspecified. How does "the next Isolate on that thread runs" actually work?

### Why This Is a Blocker

Two approaches exist, and the design needs to commit to one:

**Approach A: Multiple `JsRuntime` instances per OS thread, round-robin polled.**
Each worker thread owns a `Vec<JsRuntime>`. A custom event loop polls each runtime's event loop with a single `poll()` call (non-blocking). When one runtime is awaiting I/O (its event loop returns `Poll::Pending`), the thread moves to the next runtime. This is feasible with `deno_core`'s `JsRuntime::poll_event_loop()` — the existing `PollEventLoopOptions` supports non-blocking polling.

However, this requires a single-threaded tokio runtime per OS thread (already the pattern in `persistent_isolate.rs:162`), and that single tokio runtime must drive I/O for ALL `JsRuntime` instances on that thread. The `JsRuntime`'s internal async ops (fetch, timers, sqlite) enqueue futures on the thread-local tokio runtime. Multiple `JsRuntime` instances sharing one tokio current-thread runtime means all their I/O futures execute on the same executor. This should work because tokio current-thread runtime interleaves futures cooperatively, but it has subtle implications: a slow sync op in one runtime (e.g., a large `structuredClone` serialization) blocks ALL runtimes on that thread.

**Approach B: One `JsRuntime` per OS thread, but use V8 Contexts (not Isolates) for entity groups.**
A single `JsRuntime` (= one V8 Isolate) can have multiple V8 Contexts. Each context is a separate global object with its own builtins. This is how Cloudflare workerd isolates Workers within a single Isolate. Contexts share the V8 heap but have no JS-level access to each other's globals.

This is significantly simpler but provides weaker isolation: a rogue entity could exhaust the shared heap, and CPU time limits apply to the whole Isolate, not per-context. The serialization boundary enforcement would still work (contexts can't share references), but memory isolation is gone.

### Concrete Alternative

Commit to **Approach A** (multiple `JsRuntime` per thread) with the following clarifications:

1. Each worker thread runs a single-threaded tokio runtime.
2. The thread's main loop round-robin polls each `JsRuntime`'s event loop.
3. When a `JsRuntime` is executing JS (not waiting on I/O), it holds the thread. All other runtimes on that thread are blocked.
4. A watchdog timer detects runtimes that hold the thread for too long (the timeout enforcement mechanism).
5. Document that slow synchronous JS in one entity group can starve other groups on the same thread — this is the same trade-off as Cloudflare workerd.

Alternatively, if you choose Approach B (V8 Contexts), the architecture section needs a significant rewrite since "separate V8 Isolates" is the stated isolation boundary. V8 Contexts do NOT provide memory isolation, which weakens the "works locally = works in production" contract for memory-related bugs.

---

## Finding 2: Structured clone serialization across the Rust message bus has an impedance mismatch (BLOCKER)

### The Problem

The design says: "All inter-Isolate communication goes through the Rust message bus" with "structured clone protocol." The performance table estimates ~2us serialization for simple scalars and ~10-20us for typical entities.

But V8's structured clone (`v8::ValueSerializer`/`v8::ValueDeserializer`) operates on V8 values within a V8 scope. The existing `clone.rs` implementation shows this clearly: both serialize and deserialize happen within a single `HandleScope`. The serialized bytes (`Vec<u8>`) are the output.

For the message bus, the flow is:

1. Entity A's Isolate: serialize V8 value to `Vec<u8>` (requires V8 HandleScope for Entity A)
2. Send `Vec<u8>` through tokio channel (Rust-native, no V8 involvement)
3. Entity B's Isolate: deserialize `Vec<u8>` back to V8 value (requires V8 HandleScope for Entity B)

Steps 1 and 3 each require entering the respective Isolate's V8 scope. Since V8 Isolates are `!Send`, step 1 must happen on Entity A's thread and step 3 on Entity B's thread.

The issue is the **JS-to-Rust boundary**. When JS code in Entity A calls `ctx.queues.notifications.enqueue(data)`, how does the runtime:
1. Intercept the call at the Rust level
2. Access the V8 value while still in Entity A's scope
3. Serialize it to bytes
4. Send through the tokio channel
5. Wake Entity B's thread
6. Deserialize in Entity B's scope
7. Deliver to the queue handler

This requires a **custom deno_core op** that takes a V8 value, serializes it within the current scope, and sends the bytes through a channel that was set up during Isolate creation. The design doesn't specify this op, and the flow from "JS calls enqueue" to "Rust serializes and sends" is the most critical implementation detail of Phase 2.

### Why This Is a Blocker

Without specifying how the JS-to-Rust-to-JS bridge works for cross-isolate calls, the feasibility of the performance targets can't be validated. The overhead isn't just serialization — it's the V8 scope entry/exit, the op dispatch, and the async wakeup chain.

### Concrete Alternative

Add a section specifying the cross-Isolate call protocol:

```
JS (Entity A)                    Rust                           JS (Entity B)
────────────────────────────────────────────────────────────────────────────────
ctx.queues.foo.enqueue(data)
  → op_vertz_send(channel_id,    Receive op call
     v8_serialize(data))          Get serialized bytes
                                  tokio::mpsc::send(bytes) ───→ mpsc::recv()
                                                                v8_deserialize(bytes)
                                                                → handler(message)
```

The `op_vertz_send` op must be a fast op that serializes within the caller's scope. The receiving side needs an "inbox check" mechanism — either a poll-based check during event loop ticks, or an injected Promise that resolves when bytes arrive. The design should specify which.

---

## Finding 3: <20MB per Isolate memory target is aggressive but achievable with caveats (SHOULD-FIX)

### Analysis

The design targets <20MB per Isolate with V8 + framework code. Let me break this down based on known V8 memory characteristics:

- **V8 Isolate overhead (empty):** ~1.5-2MB (V8 builtins, compiled builtin code, initial heap)
- **V8 Isolate with snapshot:** ~2-4MB (snapshot includes pre-compiled builtins + framework code)
- **Framework code (Vertz server, entity definitions):** ~2-5MB (compiled JS in V8 heap)
- **Web API polyfills (fetch, crypto, URL, etc.):** ~1-2MB
- **Per-request heap growth:** ~0.5-2MB per active request (objects, strings, closures)
- **V8 external memory (ArrayBuffers, etc.):** variable

Realistic range: **8-15MB per Isolate at rest, 15-25MB under load.**

The 20MB target is achievable for idle Isolates IF V8 snapshots are used (which the design already identifies as Unknown U4). Without snapshots, framework code loading alone could push past 20MB because V8 keeps parsed ASTs and compiled bytecode in the heap.

### Recommendation

Change the target to: "<20MB per Isolate at rest (after GC, no active requests). <30MB per Isolate under moderate load (5 concurrent requests). V8 snapshots are MANDATORY for this target — without them, expect 25-40MB per Isolate."

Also add a memory pressure mitigation strategy: when total process memory exceeds a threshold (e.g., 80% of available RAM), the supervisor should trigger V8 `LowMemoryNotification()` on idle Isolates and potentially hibernate Isolates that haven't received requests in N seconds (save heap to disk, recreate from snapshot on next request).

---

## Finding 4: Entity grouping one-hop algorithm has a subtle correctness issue with bidirectional references (SHOULD-FIX)

### The Problem

The algorithm says:
1. Build graph of direct `ref.one()`/`ref.many()` relationships
2. For each entity, find direct neighbors (one hop)
3. Merge entities sharing a direct reference into a group
4. Cap at 5

Consider this common pattern:

```
User ←ref.one── Task ←ref.one── Comment
             ref.one──→ Project
```

- Task references User, Project
- Comment references Task

One-hop from Task: {User, Project, Comment}. One-hop from Comment: {Task}. One-hop from User: {Task} (reverse). One-hop from Project: {Task} (reverse).

Step 3 says "merge entities that share a direct reference." Task-User share a reference, Task-Comment share a reference, Task-Project share a reference. So {User, Task, Comment, Project} all merge into one group = 4 entities. This is correct and within the cap.

But consider a hub entity (common in real apps):

```
User ←── Task, Comment, Project, Invoice, Notification, AuditLog, File, Label
```

All 8 entities reference User. One-hop from any of them includes User. Since they all share a reference (to User), the algorithm merges them all into one group of 9. The cap kicks in at 5, "removing least-connected edges."

### The Issue

"Removing least-connected edges" is vague. Which edges get removed? If we remove Invoice's edge to User, Invoice becomes standalone — but it still needs to query User data (it has a foreign key). The grouping algorithm determines Isolate boundaries, and an entity that was designed to query User.name for display now crosses a serialization boundary for every lookup.

### Recommendation

Define the edge-removal heuristic precisely:
1. Identify the hub entity (highest degree node)
2. Keep the hub + its top 4 most-referenced neighbors (by bidirectional reference count)
3. Remaining entities get their own Isolates
4. Log a warning: `[runtime] Entity 'invoice' separated from 'user' group (exceeds max 5). Cross-group calls will use serialization boundary.`

Also add: entities with `tenantScoped: true` that reference each other should be grouped more aggressively (they share the same tenant's data and are likely queried together), while entities with `isolation: 'separate'` should be excluded from grouping entirely.

---

## Finding 5: HMR across multiple Isolates has an ordering hazard (SHOULD-FIX)

### The Problem

The HMR strategy says:
1. File changes
2. Compiler produces new code (~1-5ms)
3. Supervisor identifies affected Isolates from module graph
4. New code loaded into Isolate(s) via `load_side_es_module()`
5. Fast Refresh handles state preservation

When a shared module changes (e.g., a utility used by both Entity A and Entity B's Isolates), both Isolates need to hot-swap. If Entity A's swap succeeds but Entity B's fails (compilation error in the new code's interaction with B's existing state), the system is in an inconsistent state: A runs new code, B runs old code.

Worse, if Entity A sends a message to Entity B using a type shape that changed in the new code, the structured clone will deserialize into the old shape on B's side. This is the exact production inconsistency (rolling deploy with incompatible versions) that the design aims to prevent.

### Recommendation

Add an "atomic HMR" strategy:
1. Compile new code
2. Validate in ALL affected Isolates (load as side module, don't activate yet)
3. If validation succeeds in all: activate simultaneously
4. If any fails: roll back all, keep old code, show error overlay with "HMR failed in entity:B — all Isolates kept at previous version"

This is more complex but preserves the consistency contract. Without it, developers will hit "works in one entity, breaks in another" during HMR — exactly the kind of inconsistency the runtime is designed to prevent.

---

## Finding 6: tokio channel topology — broadcast channel has a subtlety with slow consumers (SHOULD-FIX)

### Analysis

The channel topology is:
- `tokio::mpsc` (bounded) for entity-to-entity, queue enqueue
- `tokio::oneshot` for synchronous cross-entity reads
- `tokio::broadcast` for config changes, cache invalidation
- `tokio::watch` for shared state (auth config)

This is a good selection. However, `tokio::broadcast` has a specific behavior: if a consumer falls behind, messages are lost (the consumer gets a `Lagged` error on its next recv). For cache invalidation events, this means a slow Isolate could miss an invalidation and serve stale data.

### Deadlock Analysis

No deadlock risk in the proposed topology because:
- `mpsc` is bounded but the design doesn't describe any circular dependency (Entity A sends to Queue B, but Queue B doesn't send back to Entity A through the same channel)
- `oneshot` is inherently deadlock-free (single use)
- `broadcast`/`watch` are non-blocking for senders

However, there IS a potential deadlock if the design evolves to support synchronous cross-entity reads (Entity A reads from Entity B via oneshot, while Entity B is trying to read from Entity A). The design should explicitly forbid circular synchronous dependencies and add runtime detection.

### Recommendation

1. For `broadcast` (cache invalidation): use `tokio::watch` instead, or switch to an epoch-based invalidation where each Isolate checks a monotonic counter on the next access. `watch` guarantees the latest value is always available (no lagged error).

2. Add a cycle detector for synchronous cross-entity calls. When Entity A sends a `oneshot` request to Entity B, record the pending dependency. If Entity B then tries to send a `oneshot` to Entity A, detect the cycle and return a `DeadlockError` instead of hanging.

---

## Finding 7: SQLite WAL mode + per-type files — concurrent read/write from the same Isolate thread (SHOULD-FIX)

### Analysis

The design says: "Each durable type's SQLite connection is owned by its Isolate's thread — no cross-thread contention."

This is correct for the single-writer case. WAL mode allows concurrent reads while a write is in progress, which is useful if the durable handler reads state while another request is writing. But since the Isolate is single-threaded (JS is single-threaded within a V8 Isolate), reads and writes from the same durable type are inherently sequential — there's no concurrency within a single Isolate.

The scenario where contention could arise: if the durable Isolate shares an OS thread with other Isolates (per the N:M model), and those other Isolates also access the same SQLite file (e.g., an entity reading from a durable's SQLite directly). The design should clarify whether entity Isolates can read durable state directly or must always go through the durable Isolate via the message bus.

### Recommendation

Explicitly state: "Durable state is only accessed by the owning durable Isolate. Entity Isolates read durable state by sending a request through the message bus — they never open the SQLite file directly. This ensures single-writer semantics and avoids WAL contention."

If multiple durable instances of the same type run concurrently (e.g., rateLimiter for "user-1" and "user-2"), they share the same SQLite file via the same connection (since they're in the same Isolate). The partitioning key (`instance_id`) ensures data isolation, but write transactions across instances still serialize through SQLite's write lock. For high-throughput durables, this could bottleneck. Document this as a known limitation with a future mitigation: "per-instance WAL-enabled databases for high-throughput durables (Phase 3+)."

---

## Finding 8: CJS interop complexity is underestimated (SHOULD-FIX)

### The Problem

The design says: "The runtime wraps CJS modules in ESM shims (same approach as Deno and Bun). `require()` is available in CJS contexts."

In practice, CJS interop is one of the most painful aspects of building a JS runtime. Key challenges:

1. **Synchronous `require()`:** CJS `require()` is synchronous, but `deno_core`'s module loading is async. The existing `VertzModuleLoader` uses `ModuleLoadResponse::Sync` for some cases (line not shown but implied by the sync path in the loader). For CJS shims, the entire dependency tree must be loaded synchronously, or a two-phase approach is needed (pre-load the CJS graph, then serve synchronously).

2. **`module.exports` vs `exports`:** CJS modules can use `module.exports = X` (default export) or `exports.foo = bar` (named exports). The shim must detect which pattern is used. Many packages mix both.

3. **Conditional requires:** `require()` inside `if` blocks or `try/catch` (feature detection) means the dependency graph isn't statically analyzable.

4. **`__dirname` and `__filename`:** CJS modules expect these globals. Each module needs its own values. The shim must inject them per-module.

5. **JSON requires:** `require('./data.json')` is common and needs special handling.

The existing codebase does not appear to have a CJS interop layer yet. This is fine for Phase 1 (single Isolate, can punt), but Phase 2 needs it for any npm package used across entity Isolates.

### Recommendation

This isn't a blocker for Phase 2 specifically (Phase 1 should build the CJS layer), but the design should acknowledge the complexity. Add to the Phase 1 deliverables: "CJS interop with >90% compatibility for top-20 npm packages used in Vertz example apps. This is gated by Unknown U7 (npm audit)."

---

## Finding 9: The `deno_core` version (0.311.0) and long-term stability (SHOULD-FIX)

### Analysis

The crate depends on `deno_core = "0.311.0"`. deno_core follows Deno's release cadence and regularly introduces breaking changes between versions. The version number (311) indicates rapid iteration.

For the Phase 2 timeline (starting months from now, running 4-6 months), the crate will likely need multiple deno_core upgrades. Each upgrade risks breaking:
- Op dispatch API (the `#[op2]` macro changes)
- Module loader trait (methods added/removed)
- V8 binding layer (types change when rusty_v8 bumps)
- Snapshot format (incompatible between versions)

The design mentions "Pin version, contribute upstream. Fallback: fork." as mitigation, but doesn't specify the pinning strategy.

### Recommendation

Add a concrete deno_core strategy:
1. Pin to a specific version in `Cargo.toml` (already done: `"0.311.0"`)
2. Create an abstraction layer (`runtime::v8_bridge`) that wraps deno_core-specific APIs. Phase 2 code should use the bridge, not deno_core directly.
3. Budget 1-2 weeks per phase for deno_core upgrades
4. The fork option should be the explicit Phase 2 fallback if deno_core makes a breaking change that conflicts with multi-Isolate-per-thread requirements

---

## Finding 10: Existing codebase reuse assessment (SHOULD-FIX — needs explicit migration plan)

### What Can Be Reused

| Component | File | Reusable? | Notes |
|---|---|---|---|
| `VertzJsRuntime` | `js_runtime.rs` | **Yes, as-is** | Core wrapper. Phase 2 creates multiple instances. No changes needed. |
| `VertzModuleLoader` | `module_loader.rs` | **Yes, with changes** | Uses `Rc<RefCell>` for internal state (correct for single-thread). Shared caches (`SharedSourceCache`, `V8CodeCache`, `SharedResolutionCache`) are already `Arc<RwLock>` and cross-thread. Each Isolate gets its own `VertzModuleLoader` instance (already the pattern in tests). |
| `PersistentIsolate` | `persistent_isolate.rs` | **Partial** | The channel-based request dispatch pattern (mpsc + oneshot) is directly applicable to the message bus. But the 1-thread-per-isolate model needs replacing with the N:M scheduler. The `isolate_event_loop` function is the starting point but needs generalization. |
| `CompileCache` | `compile_cache.rs` | **Yes, as-is** | Disk + shared in-memory cache. Already thread-safe. |
| `ModuleGraph` | `module_graph.rs` | **Yes, extend** | Tracks import dependencies. Phase 2 adds entity-relationship edges for grouping. |
| SQLite ops | `ops/sqlite.rs` | **Yes, extend** | Connection store per-Isolate. Phase 2 adds WAL mode defaults and per-type database paths. |
| Structured clone | `ops/clone.rs` | **Yes, extend** | V8 serialize/deserialize within a scope. Phase 2 adds cross-Isolate serialization (serialize in scope A, send bytes, deserialize in scope B). The core `ValueSerializer`/`ValueDeserializer` logic is reusable. |
| AsyncContext | `async_context.rs` | **Yes, as-is** | Per-Isolate promise hooks. Each Isolate gets its own async context stack. |
| HTTP server | `server/http.rs` | **Refactor** | Currently routes to a single `PersistentIsolate`. Phase 2 routes to the supervisor, which dispatches to the correct entity Isolate. Axum routing stays; dispatch changes. |
| File watcher | `watcher/` | **Yes, extend** | Watcher + module graph. Phase 2 adds the "which Isolates are affected" lookup. |
| HMR | `hmr/` | **Refactor** | Currently assumes single Isolate. Phase 2 needs multi-Isolate awareness. |

### What Needs Rewriting

| Component | Why |
|---|---|
| Isolate Supervisor | New. Nothing in the codebase manages multiple JsRuntime lifecycles cooperatively. The test runner's parallel execution is close but uses a work-stealing pattern (each thread pulls from a queue), not a pinned N:M model. |
| Message Bus | New. No inter-Isolate communication exists today. The `PersistentIsolate`'s channel pattern is a starting point but needs generalization. |
| Entity Grouping | New. The entity relationship graph analysis has no precedent in the codebase. |
| Cooperative Scheduler | New. The round-robin polling of multiple `JsRuntime` instances on one thread has no precedent. |

### Recommendation

Add a "Migration Plan" subsection to Phase 2 that lists each existing module and its migration path. This prevents the common failure mode of Phase 2 starting with "rewrite everything" when 60-70% of the codebase is reusable.

---

## Nits

### N1: The design says "hyper" for HTTP but the codebase uses axum

The architecture section says "Built on `hyper` (Rust's standard HTTP library)." The existing codebase uses `axum` (which is built on hyper). Since axum is already in use and provides higher-level routing, the design should say "axum" to match reality. This avoids confusion about whether Phase 2 replaces axum with raw hyper.

### N2: `vertz dev` startup log format should include thread assignment

The design shows entity group logging at startup:
```
[runtime] Entity groups:
  task + comment (linked by comment.ref.one(task))
```

Add thread assignment:
```
[runtime] Entity groups (4 worker threads):
  Thread 0: task + comment (linked by comment.ref.one(task))
  Thread 1: user (standalone)
  Thread 2: billing (standalone — isolation: 'separate')
  Thread 3: notifications (queue), cleanup (schedule)
```

### N3: Performance table should include the V8 scope entry/exit overhead

The serialization performance table shows "~2us serialization" for simple scalars, but this excludes V8 scope entry/exit. Entering a HandleScope has measurable overhead (~0.5-1us). For cross-Isolate calls, there are two scope entries (serialize + deserialize). Add this to the table or note it.

---

## Summary

The design is well-structured with strong kill criteria and phased gating. The existing codebase provides a solid foundation — particularly `VertzJsRuntime`, `VertzModuleLoader`, the shared cache infrastructure, and the structured clone implementation. Approximately 60-70% of the runtime layer can be reused or extended.

**Blockers:**
1. Cooperative scheduling mechanism must be specified (multiple `JsRuntime` per thread vs V8 Contexts)
2. Cross-Isolate call protocol must be specified (JS-to-Rust-to-JS bridge for message bus)

**Should-fix:**
3. Memory target needs realistic bounds with snapshot dependency
4. Entity grouping edge-removal heuristic needs precise specification
5. Atomic HMR strategy for multi-Isolate consistency
6. Broadcast channel replaced with epoch-based invalidation; add cycle detection for oneshot
7. SQLite access exclusively through durable Isolate; document write serialization
8. CJS interop complexity acknowledged in Phase 1 deliverables
9. deno_core abstraction layer for version stability
10. Explicit migration plan for existing modules

Once blockers 1 and 2 are addressed with concrete protocol specifications, the design is implementable.
