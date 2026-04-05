# Phase 2 DX Review: Multi-Isolate Entity Workers + Message Bus

- **Author:** Implementation team
- **Reviewer:** DX reviewer (Claude Opus 4.6)
- **Scope:** Phase 2 design within `plans/vertz-runtime.md` (Rev 2.1)
- **Date:** 2026-04-05

---

## Verdict: Approved (with should-fix items)

The Phase 2 design delivers on its core promise: the developer writes zero Isolate configuration, zero serialization code, zero message bus wiring. The API surface is unchanged from Phase 1, which is exactly right. The error messages are among the best I have seen in any framework design doc. The testing story is solid.

There are no blockers. There are five should-fix items and three nits that would strengthen the DX before implementation begins.

---

## Findings

### SF-1 (should-fix): `ctx.entities` cross-Isolate call ergonomics are unspecified

**What:** The design shows `ctx.queues.notifications.enqueue(...)` and `ctx.durables.rateLimiter.check(...)` for cross-Isolate communication. But the most common cross-entity call -- one entity reading from another entity -- is only shown briefly in the queue handler example: `ctx.entities.user.read(message.userId)`.

**Why it matters:** Entity-to-entity reads are the bread and butter of real apps. A task entity's `afterCreate` hook might read the project entity to check permissions, then read the user entity to get the assignee's name. Each of these crosses an Isolate boundary (if the entities are in different groups). The design does not clarify:

1. Are `ctx.entities.*` calls synchronous-feeling (awaited Promises that hide the message bus) or do they require explicit `.fetch()` / `.call()` syntax?
2. What does the type of `ctx.entities.user.read()` return? Is it the same entity row type as today, or a serialized subset?
3. If entity A and entity B are in the same group (same Isolate), does `ctx.entities.B.read()` skip serialization? Is this observable to the developer?

**Suggested fix:** Add a dedicated subsection "Cross-Entity Reads (Same Group vs Different Group)" to the Phase 2 API Surface. Show both cases explicitly. Confirm that the return type is identical regardless of grouping. Specify that same-group calls skip the message bus (zero overhead) and cross-group calls go through serialization (matching production). The developer should never have to think about which case they are in.

---

### SF-2 (should-fix): Entity grouping is invisible at the wrong time

**What:** The design says entity groups are logged at startup:
```
[runtime] Entity groups:
  task + comment (linked by comment.ref.one(task))
  user (standalone)
```

This is good for observability. But the grouping decision has performance and correctness implications (same-group = in-memory, cross-group = serialized), and the developer has no way to know their grouping at code-writing time. They only discover it when `vertz dev` starts.

**Why it matters:** Imagine a developer adds a `ref.one(task)` to their `notification` entity. This silently merges `notification` into the `task + comment` group. Their queue handler that used to cross a serialization boundary to read notifications now runs in the same Isolate. The developer never notices -- and when they deploy to production (where notifications might be a separate worker), serialization errors surface for the first time. This is the exact class of bug Phase 2 is supposed to prevent.

**Suggested fix:** Two things:

1. **Group change detection.** When entity grouping changes between dev server restarts (or during HMR when a new `ref` is added), log a prominent warning: `[runtime] Entity group changed: notification moved from standalone -> task group (linked by notification.ref.one(task))`. This makes grouping changes visible.

2. **Consider always serializing, even within groups.** This is the nuclear option and hurts performance, but it guarantees that if it works locally, it works in production regardless of how entities are deployed. The "same group skips serialization" optimization is a correctness hole. At minimum, offer a `strictSerialization: true` config for CI/staging that forces all cross-entity calls through the serialization boundary, even within groups.

---

### SF-3 (should-fix): `isolation: 'separate'` is entity-level, but the failure mode is group-level

**What:** The design provides `isolation: 'separate'` as an entity-level override to force an entity into its own Isolate. But the grouping algorithm operates on relationship graphs. If entity A has `ref.one(B)` and entity B has `ref.one(C)`, A and B are grouped but C is separate. If a developer puts `isolation: 'separate'` on B, what happens to A? Does A become standalone? Does the `ref.one(B)` relationship still work but now goes through serialization?

**Why it matters:** The interaction between `isolation: 'separate'` and the automatic grouping algorithm is not specified. A developer might put `isolation: 'separate'` on a heavily-referenced entity (like `user`) and unknowingly break the grouping assumptions of five other entities.

**Suggested fix:** Specify the behavior precisely:
- `isolation: 'separate'` on entity B means B always gets its own Isolate.
- Any entity that has `ref.one(B)` or `ref.many(B)` still groups normally with its *other* references, but calls to B go through the message bus.
- Log the impact at startup: `[runtime] user: forced separate (referenced by: task, comment, notification -- these will use message bus for user reads)`

---

### SF-4 (should-fix): Queue testing lacks failure/retry inspection

**What:** The testing section shows `server.queues.notifications.processed` for inspecting processed messages and `server.queues.notifications.drain()` for async mode. But there is no API for inspecting:

1. **Failed messages.** If a queue handler throws, where does the error go? Is there `server.queues.notifications.failed`?
2. **Retry behavior.** The queue definition specifies `retries: 3`. How does the developer test that a failing handler retries 3 times and then moves to a dead-letter state? The sync mode processes immediately -- does it also retry immediately?
3. **Dead-letter inspection.** After max retries, where does the message go? Is there `server.queues.notifications.deadLetter`?

**Why it matters:** Queue error handling is where most production bugs live. If the testing DX does not make it easy to test the unhappy path, developers will skip those tests.

**Suggested fix:** Extend the testing API:
```typescript
const server = await createTestServer({
  queues: [notificationQueue],
  queueMode: 'sync',
});

// Handler that throws on first call
await server.entities.task.create({ title: 'Fail' });

expect(server.queues.notifications.failed).toHaveLength(1);
expect(server.queues.notifications.failed[0].attempts).toBe(3);
expect(server.queues.notifications.failed[0].error.message).toBe('...');

// Or: explicit retry control
const server2 = await createTestServer({
  queues: [notificationQueue],
  queueMode: 'manual', // enqueue but don't process -- developer controls execution
});
await server2.queues.notifications.processNext(); // process one message
await server2.queues.notifications.retryFailed();  // retry all failed
```

---

### SF-5 (should-fix): `timeoutMultiplier` does not help with the debugging workflow

**What:** The design specifies a `timeoutMultiplier` (default 3x) so queue handlers get more time in dev. But the error experience when a timeout fires is not described. What does the developer see? A generic "timeout exceeded" error? Does the Isolate get killed mid-execution?

**Why it matters:** Timeouts during debugging are one of the most frustrating DX problems. A developer sets a breakpoint in a queue handler, steps through code, and the handler gets killed because the timeout expired while they were debugging. The 3x multiplier helps, but breakpoint debugging can take minutes.

**Suggested fix:**
1. Specify the timeout error message format (same quality as the SerializationError examples -- path, hint, actionable).
2. When `--inspect` is active (debugger attached), auto-disable or dramatically increase timeouts. The developer is explicitly debugging; killing their handler is hostile.
3. Document this behavior: "Timeouts are suspended when a debugger is attached via `vertz dev --inspect`."

---

### N-1 (nit): `queueMode: 'sync'` vs `'async'` naming

**What:** The test server uses `queueMode: 'sync'` and `queueMode: 'async'`. These names describe the implementation, not the intent.

**Why it matters for LLMs:** An LLM generating test code needs to choose between these modes. "sync" vs "async" requires understanding the implementation detail that sync means "process on enqueue." More intention-revealing names would be immediately clear.

**Suggested fix:** Consider `queueMode: 'immediate'` (process on enqueue, deterministic) vs `queueMode: 'background'` (process asynchronously, realistic). Or keep `sync`/`async` but add `'manual'` as the third mode (see SF-4).

---

### N-2 (nit): Structured log format does not show the entity group name

**What:** The log format shows `[entity:task]` but not which group the entity belongs to. During debugging, the developer might want to know "are task and comment in the same group?"

**Suggested fix:** Add an optional verbose mode (`vertz dev --verbose` or `VERTZ_DEBUG=groups`) that includes the group: `[entity:task (group:task+comment)]`. The default compact format is fine for day-to-day use.

---

### N-3 (nit): The design doc uses `z` (zod) but the codebase convention is `@vertz/schema`

**What:** All queue and durable examples use `import { z } from 'zod'` for schema definitions. But the project memory notes "Use @vertz/schema for validation -- Always use `s.object()`, `s.coerce.*`, `.default()` etc. Never hand-roll parse functions." and the codebase convention file (`feedback-use-schema-package.md`) requires `@vertz/schema`.

**Why it matters:** LLMs reading this design doc will generate code with `zod` imports instead of `@vertz/schema`. When the APIs ship, every example, doc page, and generated code will use the wrong import.

**Suggested fix:** Replace all `z.object(...)` / `z.string()` / `z.enum(...)` references with `s.object(...)` / `s.string()` / `s.enum(...)` from `@vertz/schema`. The type is `SchemaLike`, not `ZodSchema`.

---

## Review Focus Area Assessments

### 1. API Intuitiveness

**Rating: Excellent.** The API is unchanged from Phase 1. `entity()`, `queue()`, `durable()`, `schedule()` are all top-level functions with a name string and a config object. The pattern is completely predictable: an LLM that has seen `entity('task', { ... })` will correctly predict `queue('notifications', { ... })` without documentation.

The `createServer({ entities, queues, durables, schedules })` wiring is array-based and infers the type map from names. This is the right call -- it avoids the DX trap of requiring manual type registration.

One concern: `ctx.queues.notifications.enqueue()` and `ctx.durables.rateLimiter.check()` use different verbs for different primitives. This is correct (queues enqueue, durables perform actions) but an LLM might try `ctx.queues.notifications.send()` or `ctx.durables.rateLimiter.call()`. The type system will catch this, which is sufficient.

### 2. Zero-Config Multi-Isolate

**Rating: Good, with one gap (see SF-2).** The claim that multi-Isolate is transparent is almost fully delivered. Developers never configure Isolates, threads, or channels. Entity grouping is automatic. The one gap is that same-group optimization can mask serialization issues that surface in production.

The `isolation: 'separate'` escape hatch is correctly minimal. The `timeoutMultiplier` config is the only other runtime knob. This is the right level of surface area.

### 3. Error Experience

**Rating: Excellent.** The SerializationError and Date serialization warning examples are best-in-class. They include:
- The entity-to-entity path (`Entity "task" -> Queue "notifications"`)
- The exact field path (`$.callback`)
- The type of the offending value (`Function`)
- Why this matters (production explanation)
- A concrete fix hint

This is the standard every framework error should meet. The only missing piece is the timeout error format (see SF-5).

### 4. Testing DX

**Rating: Good, with gaps (see SF-4).** `createTestServer` with `queueMode: 'sync'` is exactly right for the happy path. Synchronous processing eliminates timing flakiness. `drain()` for async mode is useful.

The gaps are in failure testing (no `failed`/`deadLetter` inspection) and manual control (no `processNext()`/`retryFailed()`). These are critical for testing the unhappy paths that cause production incidents.

Durable testing looks clean. Fresh state per test, direct action invocation, inspectable results.

### 5. Migration Path (Phase 1 to Phase 2)

**Rating: Excellent.** The design explicitly states the developer-facing API is unchanged. The differences are purely runtime behavior (Isolate boundaries, serialization enforcement, structured logs with labels). No code changes required to upgrade from Phase 1 to Phase 2.

The only potential breaking change is behavioral: code that passes non-serializable data between entities will start failing in Phase 2 (it was silently incorrect in Phase 1). This is a feature, not a bug -- but the design should call it out explicitly as an intentional "behavioral breaking change" so developers running Phase 1 apps on Phase 2 are not surprised.

### 6. Developer Debugging

**Rating: Good.** Structured logs with Isolate labels, request tracing with trace IDs, Chrome DevTools Protocol support. The fundamentals are solid.

The gap is in the breakpoint debugging experience across Isolates. The design correctly notes that cross-Isolate stepping is a stretch goal, but does not describe what happens today: if a developer is debugging entity A's action and it calls `ctx.queues.notifications.enqueue()`, does execution "disappear" into the message bus? How does the developer then set a breakpoint in the queue handler? The trace log bridges this gap, but the debugging workflow should be documented: "Set breakpoints in both the entity handler and the queue handler. The trace log shows the causal chain between them."

---

## Summary

| ID | Severity | Title |
|----|----------|-------|
| SF-1 | should-fix | `ctx.entities` cross-Isolate call ergonomics unspecified |
| SF-2 | should-fix | Entity grouping is invisible at code-writing time; same-group optimization is a correctness hole |
| SF-3 | should-fix | `isolation: 'separate'` interaction with grouping algorithm unspecified |
| SF-4 | should-fix | Queue testing lacks failure/retry/dead-letter inspection |
| SF-5 | should-fix | Timeout error format and debugger interaction unspecified |
| N-1 | nit | `queueMode` naming could be more intention-revealing |
| N-2 | nit | Structured logs do not show entity group membership |
| N-3 | nit | Design uses `zod` imports instead of `@vertz/schema` convention |

No blockers. The design is strong. The should-fix items address gaps in the specification that would become DX pain points during implementation and adoption. All five are addressable within the design doc without architectural changes.
