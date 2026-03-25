# Vertz Runtime — Design Document (Rev 2)

> "If the runtime is too slow, we build a faster one." — Vertz Vision, Principle 8

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-03-25 | Initial draft |
| 2 | 2026-03-25 | Address 7 blockers + 20 should-fix items from DX, Product/Scope, and Technical reviews |
| 2.1 | 2026-03-25 | Address 3 Technical should-fix items from Rev 2 re-review: SSR cascading queries, native addon strategy, entity grouping algorithm |

---

## Executive Summary

Build a **purpose-built JavaScript/TypeScript runtime in Rust** that replaces Bun as the Vertz development and production target. Unlike Bun or Deno, this runtime is not a general-purpose Node.js alternative — it exists solely to serve Vertz's entity model, where a single application is developed locally as a monolith but deployed as isolated workers in production.

The core innovation: **the developer writes one app. The runtime simulates the production distributed topology locally** — with true V8 Isolate boundaries, in-process message passing, and local durable state. If it works locally, it works in production. No "works on my machine" surprises.

**Phasing strategy:** Phase 0 (native compiler) is a **standalone project** with independent value. Phases 1-4 (the runtime itself) are a **strategic option** that is evaluated only after Phase 0 ships AND the framework reaches API stability. Committing to the full runtime today would be premature.

---

## Preconditions

### Gate 1: Phase 0 proceeds immediately
Phase 0 (native NAPI compiler) has no preconditions. It delivers standalone value (10-50x faster compilation) regardless of whether the runtime is ever built.

### Gate 2: Phase 1+ requires framework API stability
The runtime implements framework APIs natively. Changing APIs after they're implemented in Rust is 5-10x more expensive than changing TypeScript. **Phase 1 does not begin until:**
- `entity()`, `queue()`, `durable()`, `schedule()` APIs are stable and shipped on Bun
- At least one production-grade example app validates the APIs
- Phase 0 is complete and the team has Rust confidence

### Gate 3: Ship queue/durable/schedule on Bun first
The `queue()`, `durable()`, and `schedule()` APIs are **framework features**, not runtime features. They must be designed, implemented, and shipped as `@vertz/server` APIs running on Bun (with in-process simulation) before the runtime exists. This:
- Validates the API design with real usage before committing to Rust
- Lets developers adopt these features immediately
- Eliminates the chicken-and-egg problem

---

## The Problem

### Today's Development vs Production Gap

Vertz developers write entities, queues, and access rules declaratively. In production (Cloudflare or future Vertz Cloud), these become isolated workers with network boundaries. But locally, everything runs in a single Bun process with no isolation — shared memory, shared event loop, no serialization boundaries.

This creates a class of bugs that only surface in production:
- Objects passed between entities that aren't serializable
- Shared state mutations that work in-process but fail across workers
- Timing assumptions that hold in a single event loop but break with network latency
- Access rule bypasses that succeed when entities share a process context

### What Bun Can and Cannot Solve

**Solvable without a custom runtime (and should be solved first):**
- Compiler speed (Phase 0: native NAPI compiler replaces ts-morph)
- HMR quirks (workarounds exist and work — see dev-server-debugging.md)
- Most dev server issues (we've built extensive workarounds)

**Genuinely requires a custom runtime:**
- **V8 Isolate model** — Bun uses JavaScriptCore, which has no Isolate concept. Multi-worker-in-one-process is impossible. This is the fundamental blocker for local-production parity.
- **Serialization boundary enforcement** — Without Isolates, there's no natural point to enforce serialization. Adding it as middleware is unreliable and bypassable.
- **Native access rule evaluation** — `rules.*` descriptors are data, but evaluating them in Rust (without entering JS) requires owning the request pipeline.
- **Durable state primitives** — Local SQLite-backed durable objects need runtime-level lifecycle management.

The case for the runtime rests on category (b) alone. The compiler speed improvement (category a) is delivered by Phase 0 regardless.

### What We're Replacing

| Bun Component | Vertz Runtime Equivalent |
|---|---|
| `Bun.serve()` | Native HTTP server (hyper) |
| Bun Plugin (`build.onLoad`) | Native compiler pipeline (oxc) |
| Bun's HMR | Controlled HMR with full module graph ownership |
| `Bun.build()` | Rolldown for client bundling (Phase 1) |
| `Bun.file()` | Direct filesystem via tokio |
| `Bun.hash()` | Native hashing (xxhash/blake3) |
| Single-threaded JSC | Multi-Isolate V8 with message bus |

---

## Alternatives Considered

### Build on Cloudflare Miniflare/workerd

Miniflare already simulates Workers, KV, Durable Objects, Queues, and R2 locally with serialization boundaries.

**Why not:** Miniflare simulates Cloudflare's platform, not Vertz's entity model. We'd need to map entities → Workers, access rules → service bindings, durable state → DO instances. This mapping layer would be as complex as building the runtime, but we'd inherit workerd's C++ codebase and Cloudflare's platform opinions. Also, Miniflare's Isolate model is designed for request isolation (short-lived), not entity isolation (long-lived). We'd be fighting the abstraction.

**What we take from workerd:** The cooperative scheduling model (Section: Threading Model) and the Worker-to-Worker zero-latency call pattern are directly applicable.

### Target Deno as runtime instead of building our own

Deno has V8 Isolates, a Rust foundation, and good TypeScript support.

**Why not:** Deno is a general-purpose runtime with its own opinions about module resolution, permissions, and deployment (Deno Deploy). We'd still need to build the Isolate supervisor, message bus, durable state, and compilation pipeline. Using Deno gives us a starting point for V8 embedding (via `deno_core`) but not the higher-level primitives. We DO plan to evaluate `deno_core` as the V8 embedding layer (see Unknown U1).

### Use Fly.io Machines for production isolation

Fly.io Machines provide per-request VM isolation at the hardware level.

**Why not:** Fly.io solves production isolation, not local development. The "works locally = works in production" contract requires the local runtime to simulate Fly's isolation model, which brings us back to building the runtime. Also, VM-level isolation (Firecracker) is 100-1000x heavier than V8 Isolate isolation.

---

## API Surface

### What Ships When

| API | Available | Phase |
|---|---|---|
| `entity()` (unchanged, faster compilation) | Phase 0 | 0 |
| `queue()` / `durable()` / `schedule()` | On Bun first (pre-runtime) | Pre-1 |
| `vertz dev` (custom runtime) | Phase 1 | 1 |
| Multi-Isolate + serialization boundaries | Phase 2 | 2 |
| `vertz deploy` | Phase 3 | 3 |

### 1. Application Entry Point (unchanged)

```typescript
// src/server.ts — identical to today's Vertz app
import { createServer } from '@vertz/server';
import { tasks } from './entities/tasks';
import { comments } from './entities/comments';
import { notificationQueue } from './queues/notifications';

export default createServer({
  entities: [tasks, comments],
  queues: [notificationQueue],
  auth: { /* ... */ },
});
```

### 2. Entity Definitions (unchanged)

```typescript
import { entity } from '@vertz/server';
import { rules } from '@vertz/auth/rules';
import { db } from '../db';

export const tasks = entity('task', {
  model: db.tasks,
  tenantScoped: true,
  access: {
    list: rules.authenticated(),
    create: rules.entitlement('task:create'),
    update: rules.all(
      rules.entitlement('task:update'),
      rules.where({ createdBy: rules.user.id }),
    ),
    delete: rules.entitlement('task:delete'),
  },
});
```

### 3. Queue Definitions (new framework API — ships on Bun first)

```typescript
// src/queues/notifications.ts
import { queue } from '@vertz/server';
import { z } from 'zod';

export const notificationQueue = queue('notifications', {
  schema: z.object({
    userId: z.string(),
    type: z.enum(['task-assigned', 'comment-added', 'mention']),
    entityId: z.string(),
  }),

  handler: async (message, ctx) => {
    const user = await ctx.entities.user.read(message.userId);
    await ctx.services.email.send({
      to: user.email,
      template: message.type,
      data: { entityId: message.entityId },
    });
  },

  retries: 3,
  timeout: 30_000,
  concurrency: 5,
});
```

### 4. Durable Objects (new framework API — ships on Bun first)

```typescript
// src/durables/rate-limiter.ts
import { durable } from '@vertz/server';
import { z } from 'zod';

export const rateLimiter = durable('rateLimiter', {
  state: z.object({
    requests: z.array(z.object({ timestamp: z.number() })),
  }),

  defaults: {
    requests: [],
  },

  actions: {
    check: async (input: { key: string; limit: number; window: number }, ctx) => {
      const now = Date.now();
      const windowStart = now - input.window;

      ctx.state.requests = ctx.state.requests.filter(
        (r) => r.timestamp > windowStart,
      );

      if (ctx.state.requests.length >= input.limit) {
        return { allowed: false, retryAfter: ctx.state.requests[0].timestamp + input.window - now };
      }

      ctx.state.requests.push({ timestamp: now });
      return { allowed: true };
    },
  },
});
```

### 5. Scheduled Tasks (new framework API — ships on Bun first)

```typescript
// src/schedules/cleanup.ts
import { schedule } from '@vertz/server';

export const cleanupSchedule = schedule('cleanupArchived', {
  cron: '0 3 * * *',
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await ctx.entities.task.deleteMany({
      where: { status: 'archived', archivedAt: { $lt: cutoff } },
    });
  },
});
```

### 6. Inter-Entity Communication — Type Wiring

The `createServer()` call builds the type map for `ctx.queues`, `ctx.durables`, and `ctx.schedules`:

```typescript
// createServer infers the full type map from the arrays
const server = createServer({
  entities: [tasks, comments],
  queues: [notificationQueue],           // key: 'notifications' (from queue name)
  durables: [rateLimiter],               // key: 'rateLimiter' (from durable name)
  schedules: [cleanupSchedule],
});

// Inside entity actions, ctx is typed based on createServer's config:
// ctx.queues.notifications.enqueue(...)  — typed by notificationQueue's schema
// ctx.durables.rateLimiter.check(...)    — typed by rateLimiter's action signatures

// TypeScript inference chain:
// queue('notifications', { schema: S })  →  QueueDef<'notifications', z.infer<S>>
// createServer({ queues: [q] })          →  ServerCtx { queues: { notifications: QueueClient<z.infer<S>> } }
// handler receives (msg, ctx: ServerCtx) →  ctx.queues.notifications is fully typed
```

If an entity needs access to a queue/durable not registered in `createServer()`, TypeScript rejects it at compile time. There is no dynamic lookup — the type map is built statically from the server configuration.

### 7. CLI

```bash
# Development — single process, multi-Isolate, HMR
vertz dev

# Production build — analyzes entity graph, generates deployment manifest
vertz build

# Production start — multi-Isolate with production constraints
vertz start

# Deploy to Vertz Cloud (or Cloudflare)
vertz deploy
```

### 8. Configuration

```typescript
// vertz.config.ts — minimal by default
import { defineConfig } from '@vertz/config';

export default defineConfig({
  dev: { port: 3000 },
  deploy: { target: 'vertz-cloud' }, // or 'cloudflare'
});
```

Isolation enforcement is **always on** — it's the core value proposition. No toggle. Timeouts use a dev multiplier (3x production values by default) to give developers headroom while still catching infinite loops:

```typescript
// Only override if you need to:
export default defineConfig({
  dev: {
    port: 3000,
    timeoutMultiplier: 5,  // 5x production timeouts during dev (default: 3x)
  },
  deploy: { target: 'vertz-cloud' },
});
```

---

## Developer Error Experience

### Serialization Boundary Failure

When a developer passes non-serializable data across an Isolate boundary, they see:

```
SERIALIZATION_ERROR: Cannot send value across entity boundary

  Entity "task" → Queue "notifications"
  Field "callback" at path $.callback is a Function, which is not serializable.

  In production, this data crosses a network boundary between Workers.
  The Vertz runtime enforces the same constraint locally so you catch
  this now — not after deploying.

  Hint: Replace the function with a serializable identifier (string, enum)
        and look it up on the receiving side.

  at onTaskCreated (src/entities/tasks.ts:42:5)
  at EntityAction.execute (@vertz/server)
```

### Date Serialization Warning

```
SERIALIZATION_WARNING: Date objects are converted to ISO strings across boundaries

  Entity "task" → Queue "audit"
  Field "createdAt" at path $.createdAt is a Date instance.
  It will arrive as a string "2026-03-25T10:30:00.000Z" in the queue handler.

  This matches production behavior (JSON serialization over HTTP).
  Use z.coerce.date() in the queue schema if you need Date objects.

  at afterCreate (src/entities/tasks.ts:28:3)
```

---

## Developer Debugging

### Unified Structured Log Stream

All Isolates write to a single structured log stream with Isolate labels:

```
[entity:task]         POST /api/tasks — 200 (12ms)
[entity:task]         → queue:notifications enqueue {userId: "u_123", type: "task-assigned"}
[queue:notifications] Received message (3μs transit) — processing
[queue:notifications] → entity:user read "u_123"
[entity:user]         read "u_123" — 200 (2ms)
[queue:notifications] Processing complete (8ms)
```

### Request Tracing

Every request gets a trace ID propagated across Isolate boundaries. `vertz dev` prints the full trace on error:

```
[trace:abc123] entity:task → queue:notifications → entity:user → email:send
               12ms          3μs transit          2ms           45ms
```

### Debugger Support

- `vertz dev --inspect` — enables Chrome DevTools Protocol for all Isolates
- Each Isolate appears as a separate "worker" in Chrome DevTools
- Breakpoints work within each Isolate independently
- Cross-Isolate stepping (step into queue handler from entity action) is a **Phase 2+ stretch goal** — Chrome DevTools Protocol does not natively support this, so the runtime would need synthetic breakpoint coordination. For Phase 1-2, developers set breakpoints in each Isolate separately; the trace log shows the causal chain.
- Source maps are fully supported (oxc generates them, runtime serves them)

---

## Testing Queues and Durables Locally

### Queue Testing

```typescript
import { createTestServer } from '@vertz/testing';

// In tests, queues process synchronously by default
const server = await createTestServer({
  entities: [taskEntity],
  queues: [notificationQueue],
  queueMode: 'sync', // default in test — process on enqueue, no timing flakiness
});

// Create a task — triggers afterCreate → enqueues notification
await server.entities.task.create({ title: 'Test', assigneeId: 'u_123' });

// Message was processed synchronously — inspect immediately
const processed = server.queues.notifications.processed;
expect(processed).toHaveLength(1);
expect(processed[0].type).toBe('task-assigned');

// For async queue testing:
const server2 = await createTestServer({
  queues: [notificationQueue],
  queueMode: 'async', // background processing
});
await server2.entities.task.create({ ... });
await server2.queues.notifications.drain(); // process all pending
```

### Durable Testing

```typescript
const server = await createTestServer({
  durables: [rateLimiter],
});

// Each test gets a fresh durable state
await server.durables.rateLimiter.check({ key: 'user-1', limit: 3, window: 60000 });
await server.durables.rateLimiter.check({ key: 'user-1', limit: 3, window: 60000 });
const result = await server.durables.rateLimiter.check({ key: 'user-1', limit: 3, window: 60000 });
expect(result.allowed).toBe(true); // 3rd request, at the limit

const blocked = await server.durables.rateLimiter.check({ key: 'user-1', limit: 3, window: 60000 });
expect(blocked.allowed).toBe(false); // 4th request, over limit
```

---

## Architecture

### Threading Model — Cooperative Scheduling (N:M)

**Finding addressed:** The Technical review correctly identified that 1 OS thread per Isolate causes thread explosion at scale. 100 entities = 100+ OS threads with 100+ tokio runtimes.

**Solution: N:M cooperative scheduling** (like Cloudflare workerd).

A small pool of **worker threads** (default: number of CPU cores) multiplexes all Isolates:

```
Worker Thread Pool (4 threads on a 4-core machine)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Thread 0 │ │ Thread 1 │ │ Thread 2 │ │ Thread 3 │
│          │ │          │ │          │ │          │
│ Entity A │ │ Entity D │ │ Queue H  │ │ SSR Pool │
│ Entity B │ │ Entity E │ │ Durable  │ │ Schedule │
│ Entity C │ │ ...      │ │ ...      │ │ ...      │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Each Isolate is pinned to a thread (V8 requires single-threaded access). Isolates on the same thread are cooperatively scheduled: when one yields (awaiting I/O, message bus, etc.), the next Isolate on that thread runs.

**Why this works:**
- V8 Isolates only need the thread when executing JS. I/O waits happen in Rust (tokio), freeing the thread.
- Entity handlers are I/O-bound (database queries, message passing) — they naturally yield often.
- 4-8 threads handle 100+ Isolates efficiently because most Isolates are idle most of the time.
- This is exactly how Cloudflare runs thousands of Workers in a single process.

**Scaling:**
- 10 entities: 4 threads, 2-3 Isolates per thread
- 50 entities: 8 threads, 6-7 Isolates per thread
- 100 entities: 8 threads, 12-13 Isolates per thread (still efficient — entity handlers are mostly idle)

**Entity grouping (default):** Entities are grouped using **one-hop direct references only** (not transitive closure). If entity A has `ref.one(B)` and entity B has `ref.one(C)`, only A and B are grouped — C stays separate unless it has its own direct reference to A or B. This prevents the connected-graph problem where transitive closure merges all entities into a single Isolate.

**Grouping algorithm:**
1. Build a graph of direct `ref.one()`/`ref.many()` relationships
2. For each entity, find its direct neighbors (one hop)
3. Merge entities that share a direct reference into a group
4. Cap group size at 5 entities — if a group exceeds 5, split by removing the least-connected edges
5. Override with explicit `isolation: 'separate'` on the entity definition

**Visibility:** `vertz dev` logs entity groups at startup:
```
[runtime] Entity groups:
  task + comment (linked by comment.ref.one(task))
  user (standalone)
  billing (standalone — isolation: 'separate' override)
```

### Runtime Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Vertz Runtime (Rust)                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Isolate Supervisor                       │  │
│  │  Owns V8 platform, Isolate lifecycle, cooperative sched   │  │
│  └────┬──────────┬──────────┬──────────┬──────────┬──────────┘  │
│       │          │          │          │          │              │
│  ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴───┐       │
│  │Entity  │ │Entity  │ │Queue H │ │Durable │ │Schedule│       │
│  │Group A │ │Group B │ │Isolate │ │Isolate │ │Isolate │       │
│  │(V8 ctx)│ │(V8 ctx)│ │        │ │        │ │        │       │
│  │~8-20MB │ │~8-20MB │ │~8-20MB │ │~8-20MB │ │~8-20MB │       │
│  └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘       │
│       │          │          │          │          │              │
│  ┌────┴──────────┴──────────┴──────────┴──────────┴──────────┐  │
│  │                    Message Bus (Rust)                      │  │
│  │  tokio channels — in-process, structured clone protocol   │  │
│  └────┬──────────┬──────────┬──────────┬─────────────────────┘  │
│       │          │          │          │                         │
│  ┌────┴───┐ ┌────┴───┐ ┌────┴───┐ ┌────┴──────────────────┐   │
│  │Durable │ │Access  │ │Schedule│ │HTTP Server (hyper)     │   │
│  │State   │ │Rules   │ │Engine  │ │SSR Engine              │   │
│  │(SQLite)│ │(native)│ │(cron)  │ │Dev Server + HMR        │   │
│  └────────┘ └────────┘ └────────┘ │Rolldown (client bundle)│   │
│                                    │Native Compiler (oxc)   │   │
│                                    └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Isolate Supervisor

The supervisor owns the V8 platform, all Isolate lifecycles, and the cooperative scheduler.

**Responsibilities:**
- Create/destroy Isolates based on the application's entity graph
- Pin Isolates to worker threads, balance load across the pool
- Route messages between Isolates via the message bus
- Enforce resource limits (memory, execution timeout)
- Hot-swap Isolate code during HMR without dropping messages
- Health monitoring — restart Isolates that exceed memory limits

**HMR strategy:** When a file changes:
1. Native compiler produces new code (~1-5ms)
2. Supervisor identifies affected Isolate(s) from the module graph
3. New code is loaded into the Isolate via `JsRuntime::load_side_es_module()`
4. Fast Refresh runtime (bootstrapped per-Isolate) handles component state preservation
5. If the Isolate fails to accept the update, supervisor creates a fresh Isolate with the new code and drains the old one

**Fast Refresh per-Isolate bootstrapping:** Each Isolate gets its own instances of the signal collector stack, context registry, and component registry on its `globalThis`. These are independent — no cross-Isolate state sharing. The SSR Isolate pool members each have their own V8 context (no sharing), which is cleaner than the current `AsyncLocalStorage` approach.

### Message Bus

All inter-Isolate communication goes through the Rust message bus — even locally.

**Why serialize locally?** This is the key to production parity. If an object isn't `structuredClone`-safe, the local dev environment catches it immediately.

**Channel topology:**
- `tokio::mpsc` (bounded) — entity-to-entity request/response, queue enqueue
- `tokio::oneshot` — synchronous cross-entity calls (entity A reads from entity B)
- `tokio::broadcast` — config changes, cache invalidation events
- `tokio::watch` — shared state (auth config, tenant registry)

**Realistic performance characteristics:**

| Payload | Serialization | Channel | Deserialization | Total |
|---|---|---|---|---|
| Simple scalar (queue enqueue) | ~2μs | ~1μs | ~2μs | **~5μs** |
| Typical entity (15 fields, nested) | ~10-20μs | ~1μs | ~10-20μs | **~20-40μs** |
| List response (50 entities) | ~200-500μs | ~1μs | ~200-500μs | **~400μs-1ms** |

These are the end-to-end costs including V8-to-Rust boundary crossings. The channel itself is single-digit microseconds; serialization dominates for non-trivial payloads.

### SSR Data Access Strategy

**Finding addressed:** The Technical review correctly identified that SSR hitting the message bus for every query would add unacceptable latency.

**Solution: Iterative pre-fetch + local cache.**

Real applications have cascading data requirements — a task list page fetches tasks, then each task card fetches its assignee. A single discovery pass cannot enumerate these dependent queries. The SSR strategy uses iterative rounds, matching the current two-pass SSR model:

1. **Round 1: Discover top-level queries** — Lightweight component tree walk collects all immediately-known data requirements (query keys, entity IDs). Runs in the SSR Isolate without data.

2. **Round 1: Batch fetch** — Supervisor sends all discovered queries to entity Isolates in a single batch. Entity Isolates execute in parallel. Results serialized once, sent back as a bundle.

3. **Round 2: Discover dependent queries** — With Round 1 data in the local cache, walk the component tree again. Components that depend on Round 1 data now register their dependent queries (e.g., task cards discover assignee IDs from task data).

4. **Round 2: Batch fetch** — Fetch all newly-discovered dependent queries in a second batch.

5. **Render** — With all data local, render the component tree. All `query()` calls hit the local cache — no message bus round-trips.

Most applications need 2 rounds (top-level + one level of dependencies). A hard cap of 5 rounds prevents pathological cases. If a query is still missing after 5 rounds, it renders as loading state and streams the result to the client (matching the existing SSR timeout behavior).

**Latency budget:**
- Round 1 (discover + fetch): ~5-30ms
- Round 2 (discover dependent + fetch): ~5-30ms
- Render: ~5-20ms
- **Total: ~15-80ms** (comparable to current two-pass SSR)

For dev mode with simple apps (no dependent queries), a single round suffices.

### Native Compiler (oxc-based)

**Acknowledged: this is a fundamental rewrite, not a port.** The current compiler uses MagicString text-level mutations with multi-pass architecture. oxc uses in-place AST mutation via `Traverse` in a single pass. The data flow must be restructured.

**Current pipeline (JavaScript, ts-morph, multi-pass):**
```
Parse → Component Analysis → Reactivity Analysis → Mutation Analysis
→ Mutation Transform → Signal Transform → Computed Transform
→ JSX Analysis → JSX Transform → Mount Frame Transform → CSS Extraction
→ Fast Refresh → Source Maps
≈ 50-200ms per file
```

**New pipeline (Rust, oxc, restructured):**
```
Parse (oxc) → Analysis pass (collect all metadata in one walk)
→ Transform pass (apply all mutations in dependency order)
→ Codegen + Source Maps (oxc)
≈ 1-5ms per file (I/O excluded)
```

**Key challenge: cross-transform dependencies.** The JSX transformer reads signal `.value` insertions from the signal transformer. In a single-pass model, transforms must be applied in the correct dependency order within the same walk. The analysis pass collects all metadata first; the transform pass has access to all analysis results.

**Transforms requiring type information:** The ReactivityAnalyzer uses manifests (pre-generated JSON) for cross-file type info. This does NOT require ts-morph's type checker — the manifest system is already a compile-time artifact. oxc transforms can read the same manifests.

**Migration plan (within Phase 0):**

| Transform | Complexity | Weeks |
|---|---|---|
| Signal insertion | Low | 2 |
| Computed wrapping | Low | 1 |
| JSX transform | High (MagicString interactions) | 4 |
| Reactivity analysis | Medium (manifest reading) | 2 |
| CSS extraction | Medium | 2 |
| Fast Refresh codegen | Medium | 2 |
| Hydration IDs | Low | 1 |
| Context stable IDs | Low | 1 |
| Source map chaining | Medium | 2 |

**Total: ~17 weeks (~4 months).** Validates against the existing test suite continuously.

### Durable State (SQLite)

**Clarification:** Cloudflare Durable Objects give each *instance* its own storage. The Vertz runtime uses one SQLite file per durable *type*, with per-instance partitioning via a key column:

```
.vertz/state/
├── rateLimiter.sqlite       # All rateLimiter instances
├── rateLimiter.sqlite-wal
└── rateLimiter.sqlite-shm
```

**Schema per durable type:**
```sql
CREATE TABLE state (
  instance_id TEXT NOT NULL,   -- e.g., "user-1", "ip-192.168.1.1"
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  PRIMARY KEY (instance_id, key)
);
```

**Why per-type, not per-instance:** Per-instance SQLite would create thousands of files for durables like rate limiters. Per-type with a partition key is the practical choice for local dev. In production, Cloudflare DO provides true per-instance storage — the abstraction boundary is the `ctx.state` API, not the storage layout.

**WAL mode** enabled by default. Each durable type's SQLite connection is owned by its Isolate's thread — no cross-thread contention.

### Access Rules Engine (Native Rust)

Vertz's `rules.*` descriptors are already data, not functions. The Rust runtime evaluates purely declarative rules without entering V8.

```rust
fn evaluate_rule(rule: &AccessRule, ctx: &RequestContext) -> bool {
    match rule {
        AccessRule::Public => true,
        AccessRule::Authenticated => ctx.user_id.is_some(),
        AccessRule::Entitlement(e) => ctx.entitlements.contains(e),
        AccessRule::All(rules) => rules.iter().all(|r| evaluate_rule(r, ctx)),
        AccessRule::Any(rules) => rules.iter().any(|r| evaluate_rule(r, ctx)),
        AccessRule::Fva(seconds) => ctx.mfa_verified_within(*seconds),
        // Where conditions with row-level checks require DB queries or V8
        AccessRule::Where(conditions) => {
            // Simple user-field comparisons: evaluate natively
            // Complex conditions: delegate to entity Isolate
            evaluate_conditions(conditions, ctx)
        },
    }
}
```

**Boundary note:** Simple rules (`authenticated()`, `entitlement()`, `role()`, `fva()`) are always evaluated in Rust — no V8 round-trip. `rules.where()` conditions that compare against `rules.user.*` markers are evaluated natively too (the marker values come from the JWT, not from DB rows).

For row-level `where` conditions (e.g., `rules.where({ status: { $ne: 'archived' } })`), the Rust engine does NOT fetch rows for evaluation. Instead, it pushes the condition as a SQL predicate to the entity Isolate's query builder — the condition becomes part of the `WHERE` clause. This avoids the circular dependency of needing row data to evaluate access before allowing row access.

### HTTP Server + SSR + Client Bundling

Built on `hyper` (Rust's standard HTTP library).

**Client bundling (Phase 1):** Delegate to Rolldown (Rust-based, oxc-compatible) as a subprocess. Rolldown handles tree-shaking, code splitting, and HMR for client code. The native runtime handles server-side compilation, SSR, and HMR coordination. Full native bundling is deferred to Phase 2+.

**SSR Isolate Pool:** Multiple V8 Isolates for SSR rendering. Each request gets its own Isolate context — the Isolate IS the isolation boundary (replacing `AsyncLocalStorage`). Pool size defaults to `max(2, cpu_cores / 2)`.

### Module Resolution and npm Compatibility

**Resolution algorithm:** Standard Node.js module resolution (`node_modules/` lookup, `package.json` `exports` field with `import`/`require`/`default` conditions). We use `oxc_resolver` (Rust, already part of the oxc ecosystem) which implements the full Node resolution spec.

**CJS interop:** Many npm packages are CJS-only (database drivers, utility libraries). The runtime wraps CJS modules in ESM shims (same approach as Deno and Bun). `require()` is available in CJS contexts.

**Native addon strategy:** Native addons (`.node` files built with node-gyp) are NOT loaded directly by the V8 runtime. However, database drivers are critical dependencies. Strategy per driver:

| Driver | Type | Runtime Strategy |
|---|---|---|
| `pg` (PostgreSQL) | Pure JS | Works directly — no native code |
| `@neondatabase/serverless` | Pure JS | Works directly — HTTP-based |
| `mysql2` | Pure JS (optional native) | Works in JS-only mode |
| `better-sqlite3` | Native addon | **Not supported.** Use `sql.js` (WASM-based SQLite) or the runtime's built-in `rusqlite` bindings exposed as a JS API |
| `@libsql/client` | HTTP-based | Works directly |

For `@vertz/db`'s SQLite dialect (used in local dev and Durable state): the runtime provides native SQLite access via Rust-side `rusqlite`, exposed to JS as a built-in module (`vertz:sqlite`). This is faster than both `better-sqlite3` and `sql.js`, and requires no native addon. The `@vertz/db` SQLite dialect adapter will be updated to use `vertz:sqlite` when running on the Vertz runtime, falling back to `better-sqlite3` on Bun/Node.

**What's NOT supported:** `node:child_process`, `node:cluster`, `node:worker_threads`, `node:vm`, arbitrary native addons. These are explicitly out of scope (see Non-Goals).

**npm audit needed (Unknown U7):** Before Phase 1 begins, audit the top 20 npm packages used by existing Vertz example apps to catalog their transitive `node:*` dependencies and native addon usage. This determines the minimum compatibility surface.

### TypeScript Type Checking

**`tsc` remains the type checker.** The runtime does NOT ship its own type checker. `vertz typecheck` runs `tsc --noEmit` (same as today's `bun run typecheck`). IDE language services (VSCode) work unchanged.

**Module resolution compatibility:** The runtime uses Node-style resolution, which is compatible with TypeScript's `moduleResolution: "bundler"` (already used in Vertz). No tsconfig changes needed.

### File Watcher + Module Graph

The runtime owns the module graph:

1. **File watcher** — native `notify` crate (cross-platform)
2. **Module graph** — tracks import relationships natively (built during initial compilation)
3. **Invalidation** — file change → graph identifies affected Isolates
4. **Recompilation** — only changed files (native oxc, ~1-5ms)
5. **Hot delivery** — compiled code to affected Isolates + Rolldown incremental update for client

---

## The "Works Locally = Works in Production" Contract

| Constraint | Local Enforcement | Production Equivalent |
|---|---|---|
| **Memory isolation** | Separate V8 Isolates — no shared JS objects between entity groups | Separate Workers |
| **Serialization boundary** | All cross-group messages serialized/deserialized | Network serialization |
| **Timeouts** | Queue handlers killed after `timeout * dev.timeoutMultiplier` | Worker CPU limits |
| **Access rules** | Evaluated in Rust before every cross-entity call | Edge evaluation |
| **Tenant isolation** | Enforced per-Isolate — entity can only see its tenant's data | RLS / per-tenant Workers |
| **Durable state** | Persists in SQLite — survives Isolate restart | Durable Objects storage |

**Intentional dev relaxation:**
- **HMR** — code hot-swapped without restarting Isolates (production does rolling deploys)
- **Timeout multiplier** — 3x production timeouts by default (configurable) for debugging headroom

---

## Manifesto Alignment

### Principle 1: "If it builds, it works"
The serialization boundary validates message shapes at runtime — but the compiler also validates at build time via the entity graph. If TypeScript says entity A can send to queue B, the runtime guarantees the channel exists and the types match.

### Principle 2: "One way to do things"
One way to define entities (`entity()`), queues (`queue()`), durables (`durable()`), and schedules (`schedule()`). The runtime infers the topology. No manual worker configuration.

### Principle 3: "AI agents are first-class users"
An LLM generates entities and queues. The runtime handles deployment topology. The LLM never reasons about Isolates or serialization.

### Principle 7: "Performance is not optional"
Native compiler (20-50x faster). Native access rules (no JS overhead). Parallel SSR via Isolate pool.

### Principle 8: "No ceilings"
This IS principle 8.

### What was rejected
- **Zig** — No V8 Isolate support. JSC can't do multi-worker-in-one-process.
- **C++** — No memory safety. workerd is C++ and hard to contribute to.
- **Go** — GC pauses, weak V8 embedding.
- **JavaScriptCore** — No Isolate model. Dead end for this vision.
- **QuickJS/Hermes** — No JIT. Unacceptable production performance.

---

## Non-Goals

1. **Node.js compatibility.** We implement Web Platform APIs (fetch, crypto, URL) but NOT `node:*` modules.
2. **General-purpose runtime.** This is not "the next Deno."
3. **npm compatibility for arbitrary packages.** We support packages Vertz apps use. Not packages depending on Node internals.
4. **Replacing Cloudflare.** Deploying to Cloudflare Workers remains first-class.
5. **Multi-language support.** TypeScript/JavaScript only.
6. **General-purpose bundler.** Client bundling via Rolldown; server compilation via oxc. Not a webpack replacement.
7. **Backward compatibility with Bun APIs.** Vertz apps use `@vertz/*` APIs — the runtime implements those natively.

---

## Unknowns

### U1: deno_core vs raw rusty_v8 — NEEDS POC
**Question:** Build on `deno_core` (module loading, op system) or directly on `rusty_v8` (full control)?
**Resolution:** POC — build minimal Isolate supervisor with each. Measure: LOC, startup time, message throughput, ease of adding ops. Target: 2 weeks.

### U2: Module graph ownership — NEEDS POC
**Question:** Build own module graph or integrate Rolldown?
**Resolution:** Evaluate Rolldown's library API for embedding. If it works as a library, use it. If not, build minimal module graph for Vertz's needs.

### U3: oxc transform maturity — NEEDS POC
**Question:** Can all Vertz compiler transforms be expressed as oxc `Traverse` implementations?
**Resolution:** Port signal insertion transform to oxc Rust. Validate against existing test suite. Target: 2 weeks for the POC; full migration is ~4 months (see compiler section).

### U4: V8 snapshots for fast startup — NEEDS RESEARCH
**Question:** Can V8 heap snapshots pre-load Vertz framework code into Isolates?
**Context:** Without snapshots, loading framework code into each Isolate takes 50-100ms. With snapshots, <5ms. Critical for keeping cold start under 1 second with 10+ Isolates.
**Resolution:** Benchmark with deno_core. If snapshots reduce framework load time by 10x+, they're mandatory for Phase 2.

### U5: Client bundling integration — NEEDS POC
**Question:** Can Rolldown be used as a library from Rust for client bundling + HMR?
**Resolution:** Build minimal integration: Rolldown compiles a client entry, watches for changes, produces incremental updates. If Rolldown can't be embedded, use it as a subprocess. Must be resolved before Phase 1 (Phase 1 needs client bundling).

### U6: Production deployment model
**Question:** Single multi-Isolate process vs multi-process for self-hosted?
**Resolution:** Start with single-process. Add multi-process option later for enterprise.

### U7: npm transitive dependency audit — NEEDS RESEARCH
**Question:** What `node:*` modules do Vertz example apps' dependencies transitively require?
**Resolution:** Audit top 20 npm packages used across example apps. Catalog every `node:*` import. This determines the minimum compatibility surface for Phase 1.

---

## POC Results

*No POCs completed yet. Planned:*

### POC 1: Isolate Supervisor (resolves U1)
- Build minimal Rust binary with 5 V8 Isolates, cooperative scheduling on 2 threads
- Message passing via tokio channels
- Measure: startup time, memory per Isolate with framework code loaded, message throughput
- Compare deno_core vs raw rusty_v8

### POC 2: oxc Compiler Transform (resolves U3)
- Port SignalTransformer to oxc `Traverse`
- Run against existing test suite
- Measure: compilation speed vs ts-morph, source map accuracy

### POC 3: Rolldown Client Bundling (resolves U5)
- Embed Rolldown from Rust, compile a Vertz client entry
- Measure: build time, HMR update time
- Validate: Vertz plugin transforms work through Rolldown

---

## Type Flow Map

### Entity → Queue Type Flow

```
queue('notifications', {                          // Queue name: 'notifications' (literal type)
  schema: z.object({ userId: z.string() }),       // Schema → z.infer = { userId: string }
  handler: async (message, ctx) => { ... }        // message: { userId: string }
})

// In entity action:
ctx.queues.notifications.enqueue({                // Typed by queue schema
  userId: task.assigneeId                         // TypeScript verifies shape
})
// ──────────────────────────────────────────────
// At runtime: crosses Isolate boundary
// Message serialized → Rust channel → deserialized in queue Isolate
// Type safety: compile time (TypeScript). Serialization safety: dev runtime.
```

### Entity → Durable Type Flow

```
durable('rateLimiter', {
  state: z.object({ requests: z.array(z.object({ timestamp: z.number() })) }),
  defaults: { requests: [] },
  actions: {
    check: async (input: { key: string }, ctx) => {
      ctx.state.requests    // typed: { timestamp: number }[]
      return { allowed: true }
    }
  }
})

// In entity action:
const result = await ctx.durables.rateLimiter.check({ key: userId });
// result: { allowed: boolean } — dot notation, full autocomplete
```

### Compile-Time → Runtime Type Contract

```typescript
// .test-d.ts — Type flow verification
import { queue } from '@vertz/server';

const q = queue('test', {
  schema: z.object({ id: z.string() }),
  handler: async (msg) => { msg.id }, // msg.id: string ✓
});

// @ts-expect-error — wrong shape rejected at compile time
q.enqueue({ wrong: 123 });

// @ts-expect-error — missing required field
q.enqueue({});
```

---

## E2E Acceptance Test

### Test 1: Local-Production Parity (serialization boundary)

```typescript
describe('Feature: Cross-entity serialization boundary', () => {
  describe('Given an entity action that passes a non-serializable object', () => {
    describe('When the action is called in dev mode', () => {
      it('Then it throws a SerializationError with path and hint', async () => {
        const server = await createTestServer({
          entities: [taskEntity],
          queues: [auditQueue],
        });

        const result = await server.entities.task.create({
          title: 'Test',
          callback: () => {},
        });
        expect(result.error.code).toBe('SERIALIZATION_ERROR');
        expect(result.error.message).toContain('$.callback');
        expect(result.error.message).toContain('Function');
      });
    });
  });
});
```

### Test 2: HMR with Isolate Preservation

```typescript
describe('Feature: HMR across Isolate boundaries', () => {
  describe('Given a running dev server with entity and queue Isolates', () => {
    describe('When a queue handler file is modified', () => {
      it('Then only the queue Isolate reloads — entity state preserved', async () => {
        const dev = await startDevServer();
        await dev.fetch('/api/tasks', { method: 'POST', body: { title: 'Keep me' } });

        await dev.editFile('src/queues/notifications.ts', (code) =>
          code.replace('task-assigned', 'task-assigned-v2'),
        );
        await dev.waitForHmr();

        const tasks = await dev.fetch('/api/tasks');
        expect(tasks.body.items[0].title).toBe('Keep me');

        await dev.fetch('/api/tasks', { method: 'POST', body: { title: 'Trigger' } });
        const msg = await dev.queues.notifications.lastMessage();
        expect(msg.type).toBe('task-assigned-v2');
      });
    });
  });
});
```

### Test 3: Native Compiler Performance

```typescript
describe('Feature: Native compilation speed', () => {
  describe('Given a complex component with signals, computed, JSX, and CSS', () => {
    describe('When compiled with the native oxc compiler', () => {
      it('Then compilation completes in under 5ms (excluding I/O)', async () => {
        const source = await readFile('fixtures/complex-component.tsx');
        const start = performance.now();
        const result = compile(source, { filename: 'complex-component.tsx', target: 'dom' });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(5);
        expect(result.code).toContain('signal(');
        expect(result.sourceMap).toBeDefined();
      });
    });
  });
});
```

### Test 4: Queue Testing (sync mode)

```typescript
describe('Feature: Synchronous queue processing in tests', () => {
  describe('Given a test server with sync queue mode', () => {
    describe('When an entity action enqueues a message', () => {
      it('Then the message is processed before the action returns', async () => {
        const server = await createTestServer({
          entities: [taskEntity],
          queues: [notificationQueue],
          queueMode: 'sync',
        });

        await server.entities.task.create({ title: 'Test', assigneeId: 'u_123' });

        expect(server.queues.notifications.processed).toHaveLength(1);
        expect(server.queues.notifications.processed[0].userId).toBe('u_123');
      });
    });
  });
});
```

### Test 5: Durable State Persistence

```typescript
describe('Feature: Durable state survives restart', () => {
  describe('Given a durable with accumulated state', () => {
    describe('When the dev server restarts', () => {
      it('Then state is preserved from SQLite', async () => {
        const dev1 = await startDevServer();
        await dev1.durables.rateLimiter.check({ key: 'user-1', limit: 10, window: 60000 });
        await dev1.durables.rateLimiter.check({ key: 'user-1', limit: 10, window: 60000 });
        await dev1.stop();

        const dev2 = await startDevServer();
        const result = await dev2.durables.rateLimiter.check({ key: 'user-1', limit: 10, window: 60000 });
        expect(result.requestCount).toBe(3);
      });
    });
  });
});
```

---

## Phased Implementation Plan

### Phase 0: Native Compiler as Bun NAPI Plugin (4-6 months)

> **This is a standalone project.** It delivers value regardless of whether Phases 1-4 are ever built.

**Goal:** Replace the ts-morph compiler with oxc-based Rust transforms. Delivered as a NAPI module that plugs into the existing Bun dev server.

**Deliverables:**
- oxc-based compiler rewrite with all Vertz transforms (Rust)
- NAPI bindings for Bun consumption
- Benchmark: compilation speed vs ts-morph
- All existing compiler tests passing

**Acceptance criteria:**
- Every existing Vertz compiler test passes with the native compiler
- Single-file compilation under 5ms (excluding I/O)
- Source maps are accurate (stack traces point to correct lines)
- HMR works identically with the native compiler

**Kill gate:** If after 3 months, fewer than half the transforms are ported and the remaining transforms have blockers in oxc's API, pause and re-evaluate. Fallback: keep ts-morph, explore hybrid approach (oxc parse + JS transforms).

### Phase 1: Core Runtime — Single-Isolate Dev Server (6-10 months)

> **Precondition:** Phase 0 complete. Framework queue/durable/schedule APIs stable on Bun. Team has Rust confidence.

**Goal:** Replace Bun as the dev server. Single V8 Isolate (same model as today), native HTTP, native HMR, Rolldown for client bundling.

**Deliverables:**
- Rust binary (`vertz`) with `vertz dev` command
- V8 Isolate running the full Vertz application
- Native HTTP server (hyper) with SSR
- Native file watcher + module graph
- HMR with native compiler
- Rolldown for client bundling
- Chrome DevTools Protocol support (`vertz dev --inspect`)

**Acceptance criteria:**
- Linear-clone example app runs unmodified on the new runtime
- HMR latency < 50ms (file save → browser update)
- Cold start < 1 second (with V8 snapshots) or < 2 seconds (without)
- All existing example app E2E tests pass

**Kill gate at 4-month mark:** Is the linear-clone app loading its first page? If not, reassess timeline and scope. The question is not "is it perfect" but "is the trajectory viable."

**Performance validation (mandatory before Phase 2):**
- Measure actual memory per Isolate with Vertz framework code loaded
- If >30MB per Isolate, the per-entity model in Phase 2 needs redesign
- Benchmark SSR throughput vs Bun — must be within 80% of Bun's performance

### Phase 2: Multi-Isolate — Entity Workers + Message Bus (4-6 months)

> **Precondition:** Phase 1 complete with DX parity vs Bun. Performance validation passed.

**Goal:** The defining feature. Entity groups, queues, and durables run in separate Isolates. Serialization boundary enforcement. Local-production parity.

**Deliverables:**
- Isolate Supervisor with cooperative scheduling (N:M)
- Message bus with serialization boundary
- Entity grouping (related entities share Isolate by default)
- Queue handler Isolates with timeout enforcement
- Durable Isolates with SQLite state
- Structured log stream with Isolate labels
- Request tracing across Isolate boundaries

**Acceptance criteria:**
- Cross-entity-group calls go through serialization boundary
- Non-serializable data fails locally with clear error messages
- Queue handlers timeout correctly (with dev multiplier)
- Durable state persists across Isolate restarts
- Memory overhead < 20MB per Isolate (with framework code + V8 snapshots)
- 50 entities run comfortably on a developer laptop (< 400MB total)

**Kill gate at 3-month mark:** Is message passing working with real entity code? If not, re-scope.

### Phase 3: Production Deployment (3-5 months)

**Goal:** `vertz start` runs production mode. `vertz deploy` targets Cloudflare or Vertz Cloud.

**Deliverables:**
- `vertz build` — entity graph analysis, deployment manifest
- `vertz start` — production mode with full constraints
- `vertz deploy` — Cloudflare Workers adapter
- Deployment manifest format

**Acceptance criteria:**
- `vertz deploy` successfully deploys to Cloudflare Workers
- Queue messages delivered reliably (at-least-once)
- Scheduled tasks fire correctly
- Production mode enforces all constraints

### Phase 4: Native Signal Runtime + Parallel SSR (3-4 months)

**Goal:** Move signal graph evaluation to Rust. Parallelize SSR across Isolate pool.

**Deliverables:**
- Rust-native signal/computed/effect evaluation
- SSR Isolate pool with request routing
- Streaming SSR

**Acceptance criteria:**
- SSR throughput scales linearly with pool size
- p99 SSR latency < 50ms for typical pages

### Timeline Estimates

| Phase | Optimistic | Realistic | Pessimistic |
|---|---|---|---|
| Phase 0 | 4 months | 5 months | 7 months |
| Phase 1 | 6 months | 8 months | 12 months |
| Phase 2 | 4 months | 5 months | 8 months |
| Phase 3 | 3 months | 4 months | 6 months |
| Phase 4 | 3 months | 4 months | 6 months |
| **Total** | **20 months** | **26 months** | **39 months** |

These assume AI-assisted development with growing Rust expertise. The realistic total is ~2 years.

---

## Team & Rust Expertise

### Current State
The team's entire codebase is TypeScript. No production Rust experience.

### Ramp-Up Plan
- **Phase 0** is the learning vehicle. Building a NAPI module with oxc transforms is a bounded, well-defined Rust project. The team builds Rust skills on a zero-risk deliverable.
- **AI-assisted Rust development.** Claude writes and reviews Rust code. The team focuses on architecture decisions and integration testing.
- **If Phase 0 reveals that Rust velocity is unacceptable,** the runtime initiative pauses. This is an explicit kill criterion.

### Who Works on This
- Primary: AI agents (Claude) writing Rust code under human architectural guidance
- Human role: architecture decisions, API design, integration testing, final review
- No Rust hiring planned initially — evaluate after Phase 0

---

## Kill Criteria

| Checkpoint | Question | Kill if... |
|---|---|---|
| Phase 0, 3 months | Are transforms porting to oxc? | <50% transforms ported AND oxc API blockers identified |
| Phase 0 complete | Is compilation genuinely faster? | <5x improvement over ts-morph (target is 20-50x) |
| Phase 1, 4 months | Is the example app loading? | Can't render a page on the custom runtime |
| Phase 1 complete | Is DX parity with Bun achieved? | Developers prefer Bun for daily work |
| Phase 2, 3 months | Is message passing working? | Can't reliably pass messages between Isolates with real entity code |
| Phase 2 complete | Does 50-entity app run on laptop? | >1GB memory or >5s cold start |
| Any phase | Is Rust velocity acceptable? | Phase takes >2x pessimistic estimate |

**The metric that matters: developer adoption.** If at any checkpoint the runtime is slower to develop against than Bun, pause and reconsider.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| deno_core API instability | Medium | High | Pin version, contribute upstream. Fallback: fork. |
| oxc transform API insufficient | Low | High | POC validates. Fallback: hybrid (oxc parse + JS transform). |
| V8 Isolate memory too high | Medium | High | **Must benchmark in Phase 1.** Snapshots reduce by ~60%. Entity grouping reduces count. |
| Cooperative scheduling complexity | Medium | Medium | Follow workerd patterns. Start with simple round-robin. |
| npm package compatibility | Medium | Medium | Audit before Phase 1 (U7). Shim critical `node:*` modules. |
| Rust velocity (AI + human) | Medium | High | Phase 0 is the test. Explicit kill criterion. |
| Scope creep | Medium | High | Non-goals are explicit. Regular check: "does this serve Vertz specifically?" |
| Framework API churn during runtime dev | High | High | **Precondition gate:** APIs must be stable before Phase 1. |

---

## Appendix: Language Choice Analysis

### Why Rust

1. **V8 bindings are first-class.** `rusty_v8` is maintained by the Deno team, stable since v129, used by Deno and Supabase in production.
2. **Memory safety without GC.** Managing V8 Isolates (each with their own GC) inside a second GC runtime would cause unpredictable latency.
3. **tokio is proven.** Battle-tested async runtime by Cloudflare, AWS, Discord.
4. **oxc is Rust.** Compiler runs in-process — no IPC, no NAPI overhead.
5. **Ecosystem alignment.** rusqlite, hyper, notify, blake3 — all production-grade.

### Comparison Matrix

| Criterion | Rust | Zig | C++ | Go |
|---|---|---|---|---|
| V8 bindings maturity | ★★★★★ | ★★☆☆☆ | ★★★★★ (native) | ★★☆☆☆ |
| Memory safety | ★★★★★ | ★★★★☆ | ★★☆☆☆ | ★★★★★ (GC) |
| Async runtime | ★★★★★ (tokio) | ★★★☆☆ | ★★★☆☆ | ★★★★★ |
| Parser/transformer (oxc) | ★★★★★ (native) | ★★★☆☆ | ★★★☆☆ | ★☆☆☆☆ |
| Learning curve | ★★☆☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★★★ |
| Production references | Deno, Supabase | Bun | workerd, Node | — |

---

## Open Questions for Review

1. **Open source strategy:** Is the runtime open-source from day one (like workerd), or proprietary initially?
2. **Runtime naming:** Keep "Vertz Runtime" (the `vertz` CLI is already the brand) vs separate identity?
