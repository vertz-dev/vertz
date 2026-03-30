# Phase 0: Design Technical Review — `@vertz/agents`

- **Author:** Design team
- **Reviewer:** Technical reviewer (Claude Opus 4.6)
- **Document:** `plans/vertz-agents.md` (Rev 1)
- **Date:** 2026-03-30

## Review Summary

The design is well-structured and correctly mirrors the existing `entity()`/`service()` config-object pattern. The API surface is intuitive and aligns with Vertz conventions. However, several areas of hidden complexity need resolution before implementation can begin -- particularly around the Cloudflare class-generation mechanism, the workflow step type system, and the runtime boundary between `@vertz/agents` and Cloudflare's Durable Objects.

---

## Findings

### 1. Cloudflare Agent Class Generation -- Mechanism Unspecified [Blocker]

The design says `agent()` "produces a Cloudflare `Agent` subclass" (Phase 1 deliverables). This is the single most important implementation detail and it is completely absent.

Cloudflare's `Agent` SDK requires extending a class, and wrangler expects these classes to be exported at the top level of a module and referenced in `wrangler.toml`:

```toml
[durable_objects]
bindings = [{ name = "MY_AGENT", class_name = "MyAgent" }]
```

The design's `agent()` returns a config object (like `entity()` returns `EntityDefinition`). But unlike entities, which are wired at runtime by `createServer()` into HTTP routes, Cloudflare Durable Objects require **class exports at the module level** that wrangler discovers statically.

**Questions that must be answered:**
1. Does `agent()` return a class (not a plain config object)? If so, this is a significant departure from the `entity()`/`service()` pattern.
2. Does a build step (compiler plugin or codegen) generate the class wrappers?
3. Can it work via a runtime registry pattern where `agents()` in `createServer()` dynamically creates DO bindings?
4. How does `wrangler.toml` get populated?

**Recommendation:** Add a "Runtime Mapping" section specifying exactly how `agent('code-review', { ... })` becomes a Cloudflare Durable Object class. This likely requires either (a) a codegen step the Vertz CLI runs before wrangler, or (b) `agent()` literally returning a class constructor. Both have significant design implications.

---

### 2. Workflow Step Type System -- Requires Recursive Mapped Types [Blocker]

The design claims `prev` in step input functions is typed against all preceding step outputs. This requires:

1. Accumulating output types from all preceding steps in the array
2. Handling `parallel` steps (DAG, not linear)
3. Handling `when` conditions (output may not exist -- is it `| undefined`?)
4. Handling `goto` (cycle in the type graph -- TypeScript cannot represent cyclic dependencies without lazy wrappers)

I studied the existing patterns. `EntityConfig` uses `TActions extends Record<string, EntityActionDef<any, any, ...>>` with phantom types. That works because actions are independent. Workflow steps are **sequentially dependent**.

The E2E acceptance test (lines 631-661) is too simple -- 2 sequential steps. The real test needs 3+ sequential steps with parallel groups, a `when`+`goto` loop, and accessing step output behind a `when` guard.

**Recommendation:** Write a `.test-d.ts` file proving the full type flow -- including parallel, conditional, and goto patterns. If TypeScript cannot express this statically, either (a) simplify workflows to linear-only for v1, or (b) accept loose typing on `prev` with runtime validation.

---

### 3. `@vertz/schema` vs `SchemaLike` -- Wrong Schema System [Blocker]

The design uses `s.object()`, `s.string()`, etc. from `@vertz/schema` throughout. But existing `entity()` and `service()` types use `SchemaLike<T>` from `@vertz/db`, not `Schema<T>` from `@vertz/schema`.

Key concerns:
1. `tool({ input, output })` -- do these schemas go through `SchemaLike`, or is this a new pattern using `@vertz/schema` directly?
2. `state: s.object(...)` -- type extraction requires `Infer<T>` which needs `SchemaAny`, not `SchemaLike`. These are different type hierarchies.
3. How does `s.object(...)` satisfy the schema validation needs of the agent (parse for runtime validation, `toJSONSchema()` for the LLM)?

**Recommendation:** Specify which schema interface `tool()` and `agent()` use. If diverging from entity/service's `SchemaLike`, document why and how `Infer<T>` flows from schema to `ctx.state` and handler parameters.

---

### 4. ReAct Loop -- Insufficient Error Recovery Design [Should-fix]

Missing from the design:

**a) "Progress" is undefined.** `stuckThreshold: 5` means "5 consecutive iterations without progress" -- but what counts as progress? Any tool call? Only successful ones? State changes?

**b) LLM error handling.** No behavior defined for: malformed tool calls, LLM refusing to use tools, provider rate limits/5xx, tool handler exceptions.

**c) Token budget management.** U2 identifies context window management as a research item, but the loop config has no `tokenBudget` or `contextStrategy`. At ~1000 tokens per iteration, 50 iterations = ~50K tokens of conversation history. This will blow context before reaching maxIterations on some models.

**d) `onStuck: 'escalate'` -- escalate to what?** Sets `status = 'waiting-for-human'` but there's no delivery mechanism (no WebSocket notification, no email/Slack integration).

**Recommendation:** Add error handling per failure mode, progress detection strategy, and escalation delivery mechanism.

---

### 5. `sandbox()` API -- Abstraction Over Vastly Different APIs [Should-fix]

Cloudflare Containers vs. Daytona differ fundamentally:
- **Lifecycle:** Ephemeral vs. persistent
- **Filesystem:** No persistent FS vs. full persistent FS with git
- **Cold start:** ~5-10s vs. ~30-60s
- **State:** Destroyed on completion vs. persists between uses

`ctx.sandbox.exec()` hides these, but they leak immediately: `git clone` needs persistent FS, `bun install && bun test` needs cached `node_modules`, Daytona needs explicit cleanup.

**Recommendation:** Add a `persistence` config, document limitations per provider, add lifecycle hooks (`onInit`, `onDestroy`).

---

### 6. State Management -- Dual State Systems [Should-fix]

Cloudflare's Agent SDK has built-in `this.setState()`/`this.state` persisted to DO SQLite. The design adds a schema-validated `state` on top but doesn't specify how they compose:
- Is `ctx.state` a Proxy over `this.state`?
- When are writes persisted? Every mutation? Checkpoints only?
- Is schema validation run on every write or only at persistence boundaries?
- Does `onStateUpdate()` from CF's SDK integrate?

**Recommendation:** Specify the state persistence model and proxy mechanism.

---

### 7. Testing Strategy -- Durable Objects Untestable in Isolation [Should-fix]

Agent execution depends on Durable Object runtime. The design lists test files but doesn't specify:
- What can be tested with `bun test` (tools, schemas, loop logic, types)
- What requires Miniflare/Cloudflare Vitest (agent lifecycle, DO state, WebSocket)
- How to mock entity injection for tool handler tests
- Whether `@cloudflare/vitest-pool-workers` is needed

For a TDD-first project, this is foundational.

---

### 8. Package Dependency Direction -- Circular Reference [Should-fix]

`@vertz/agents` imports `rules` from `@vertz/server`. `createServer()` in `@vertz/server` accepts `agents: agents([...])`. This creates a circular reference at the API level.

Looking at existing patterns: `EntityDefinition` and `ServiceDefinition` are defined in `@vertz/server`. `AgentDefinition` should follow the same pattern -- define the structural type in `@vertz/server`, let `@vertz/agents` produce it. The `agents` Cloudflare SDK dependency stays in `@vertz/agents` only.

---

### 9. `invoke()` -- Return Type and Wait Mechanism Undefined [Should-fix]

- **Return type:** Agents have no `output` schema. What does `invoke()` return? The LLM's final text? The agent's state?
- **`waitFor: 'complete'`:** DO stubs have no built-in wait-for-completion. This requires polling, WebSocket, or alarm-based callback.
- **Cross-agent state access:** Can agent A read agent B's state, or only through the message response?

**Recommendation:** Add `output` schema to `agent()`, or specify that `invoke()` returns `string`. Define the `waitFor` mechanism.

---

### 10. Client-Side Tool Execution -- No Protocol [Should-fix]

`execution: 'client'` with no `handler` implies server-to-browser tool delegation via WebSocket. But no protocol is specified: disconnection handling, timeout, multi-client arbitration, client-side tool registry.

**Recommendation:** Defer to v2 or specify the WebSocket protocol.

---

### 11. Agent Access Rules -- Different Semantics [Nit]

Agent access uses `invoke` and `approve` instead of entity's `list/get/create/update/delete`. `rules.where()` makes no sense for agent invocation (no "row" to check). Should be a type error.

---

### 12. LLM Provider Interface [Nit]

The `providers/` directory is listed but the provider interface type is unspecified. Tool definition serialization, tool call parsing, streaming, and token counting all differ per provider. Define the interface shape so Phase 1 can target it.

---

### 13. Checkpoint Storage Mechanism [Nit]

DO key-value storage has 128KB per-key limit. At 50 iterations, conversation checkpoints could exceed this. Specify whether checkpoints use KV (128KB limit) or SQLite (10GB limit).

---

### 14. Observability [Nit]

`ctx.log(level, message)` -- where do logs go? Is the ReAct loop auto-logged? Are tool invocations and latencies tracked? Is there a run ID for correlation? Critical for Phase 4 dogfood.

---

## Verdict: Changes Requested

### Blockers (3)
1. Cloudflare class generation mechanism
2. Workflow step type system proof (`.test-d.ts`)
3. Schema system integration (`SchemaLike` vs `Schema`)

### Should-fix (7)
4. ReAct loop error recovery
5. Sandbox persistence model
6. State management proxy mechanism
7. Testing strategy for Durable Objects
8. Package dependency direction
9. `invoke()` return type and `waitFor`
10. Client-side tool execution (or defer)

### Nits (4)
11. Agent access rule vocabulary
12. LLM provider interface shape
13. Checkpoint storage limits
14. Observability
