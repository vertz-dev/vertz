# @vertz/agents

## 0.2.48

### Patch Changes

- [#2837](https://github.com/vertz-dev/vertz/pull/2837) [`c36cf19`](https://github.com/vertz-dev/vertz/commit/c36cf1954162b548c92c52e2ab30e5fb7ac2eced) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(agents): add Anthropic provider adapter

  `@vertz/agents` now supports Anthropic's Claude models via the native Messages
  API. Use `{ provider: 'anthropic', model: 'claude-sonnet-4-6' }` in your agent
  config and set `ANTHROPIC_API_KEY` in the environment.

  ```ts
  const triage = agent({
    model: { provider: "anthropic", model: "claude-sonnet-4-6" },
    // ...
  });
  ```

  The adapter speaks the native Messages API (not the OpenAI-compatible shim),
  so tool calls flow through `tool_use` / `tool_result` content blocks and
  token usage is reported via `TokenUsageSummary`.

  Closes #2834.

- [#2840](https://github.com/vertz-dev/vertz/pull/2840) [`7ad1ed7`](https://github.com/vertz-dev/vertz/commit/7ad1ed702b806c55e8822f98010f1c3e7f16a7eb) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(agents): export `d1Store` from the main `@vertz/agents` entry

  `d1Store` was previously only reachable via the internal `@vertz/agents/cloudflare`
  subpath (or via a deep relative import into `stores/d1-store`). It now sits
  alongside `memoryStore` and `sqliteStore` on the main entry:

  ```ts
  import { d1Store, run } from "@vertz/agents";

  const store = d1Store({ binding: env.DB });
  ```

  Also exports the `D1Binding` and `D1StoreOptions` types for consumers who
  want to abstract over the binding. The `@vertz/agents/cloudflare` subpath
  is unchanged — existing imports still work.

  Closes #2838.

- [#2841](https://github.com/vertz-dev/vertz/pull/2841) [`091282b`](https://github.com/vertz-dev/vertz/commit/091282bff66917c65ec1b0e5a6bfdf584ebf2cd8) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Durable tool execution + transactional resume. When `run()` is called
  with `store + sessionId` against a durable store (`sqliteStore` /
  `d1Store`), each tool-call step now commits atomically — pre-dispatch
  assistant-with-toolCalls in one atomic write, post-dispatch
  tool_results in another. If the process dies between the two, a later
  `run()` with the same `sessionId` detects the orphan and either
  re-invokes handlers declared `safeToRetry: true` or surfaces a
  `ToolDurabilityError` tool_result for the LLM to reason about in-band.

  **New exports** from `@vertz/agents`:

  - `AgentStore.appendMessagesAtomic(sessionId, messages, session)` — the
    durability primitive. Implemented on all three stores.
  - `MemoryStoreNotDurableError` — thrown at `run()` entry when
    `memoryStore()` is paired with `sessionId`. Memory store cannot
    guarantee durable writes.
  - `ToolDurabilityError` — surfaced as a tool_result when an orphaned
    non-`safeToRetry` tool call is detected on resume.
  - `tool({ safeToRetry: true, ... })` — optional per-tool flag. When
    true, the framework may re-invoke the handler on resume. Default
    (omitted) assumes side effects.

  **New subpath**: `@vertz/agents/testing` with
  `crashAfterToolResults(store, failOnCallNumber = 2)` for writing
  resume tests.

  **Removed** (pre-v1, no shim): `AgentLoopConfig.checkpointInterval` +
  `ReactLoopOptions.onCheckpoint`. They were a notification callback,
  not a durability primitive, and they created ambiguity with the new
  `store + sessionId` path.

  Closes #2835.

- Updated dependencies []:
  - @vertz/errors@0.2.73
  - @vertz/schema@0.2.73
  - @vertz/server@0.2.73

## 0.2.47

### Patch Changes

- [#2732](https://github.com/vertz-dev/vertz/pull/2732) [`3e9049f`](https://github.com/vertz-dev/vertz/commit/3e9049ffeb240d08f1a5ff2f657997a552fc3592) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(agents): remove broken `approval` and `execution` tool config fields

  Both fields were declared on `ToolConfig` / `ToolDefinition` but had no real runtime behavior:

  - `approval` was preserved through `tool()` but the ReAct loop never checked it, so an agent that set `approval: { required: true }` on a destructive tool would execute anyway. A security footgun in the type surface.
  - `execution: 'client'` caused the loop to return an error tool message ("cannot be executed on the server") with no protocol for host round-trip. The feature was never implemented.

  Both fields are now removed from the public type surface along with the `ToolApprovalConfig` and `ToolExecution` type exports. The misleading "client-side tool" runtime error is replaced with a clearer "tool has no handler" message pointing at the `ToolProvider` option.

  Workflow step approval (`StepApprovalConfig` on `workflow().step({ approval })`) is a separate, working feature and is unchanged.

  A proper suspend/resume protocol covering human-in-the-loop approval and client-side tool round-trips will be designed alongside the Durable Object runtime work, where per-session persistence is transactional.

- Updated dependencies []:
  - @vertz/errors@0.2.68
  - @vertz/schema@0.2.68
  - @vertz/server@0.2.68

## 0.2.46

### Patch Changes

- [#2724](https://github.com/vertz-dev/vertz/pull/2724) [`b0779d5`](https://github.com/vertz-dev/vertz/commit/b0779d5f67fd85887b54cbb37a61610287990cb6) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(agents): propagate `userId`/`tenantId` to sub-agents via `ctx.agents.invoke()`

  Previously, `ctx.agents.invoke()` dropped the caller's identity, so every sub-agent ran with `null` `userId` and `tenantId` — a privilege-confusion bug where sub-agent tools saw no authenticated user regardless of the caller's context.

  Sub-agents now inherit the parent's identity by default. An optional `as: { userId?, tenantId? }` override on `invoke()` lets a tool handler explicitly rescope a sub-run (set a field to `null` to drop it entirely).

  `userId` and `tenantId` are now accepted on all `run()` calls — not only when a store is provided — so stateless callers can also thread identity through.

- Updated dependencies []:
  - @vertz/errors@0.2.67
  - @vertz/schema@0.2.67
  - @vertz/server@0.2.67

## 0.2.45

### Patch Changes

- Updated dependencies [[`5634207`](https://github.com/vertz-dev/vertz/commit/5634207b611babea33a47d2feeb78bc11617ebc3), [`6889e4d`](https://github.com/vertz-dev/vertz/commit/6889e4df58deca0e2cb44067bc5d070eba9e431b)]:
  - @vertz/sqlite@0.2.59
  - @vertz/server@0.2.61
  - @vertz/errors@0.2.61
  - @vertz/schema@0.2.61

## 0.2.44

### Patch Changes

- [#2528](https://github.com/vertz-dev/vertz/pull/2528) [`8cc3a59`](https://github.com/vertz-dev/vertz/commit/8cc3a5994b11bbcbd2544238787516e8f293efc9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Guard cloud auth and provider tests behind env var checks so they skip gracefully when credentials are missing. Also fix `describe.skip` propagation to nested suites in the vtz test runner.

- Updated dependencies [[`8cc3a59`](https://github.com/vertz-dev/vertz/commit/8cc3a5994b11bbcbd2544238787516e8f293efc9)]:
  - @vertz/server@0.2.60
  - @vertz/errors@0.2.60
  - @vertz/schema@0.2.60

## 0.2.43

### Patch Changes

- [#2359](https://github.com/vertz-dev/vertz/pull/2359) [`fdb0c56`](https://github.com/vertz-dev/vertz/commit/fdb0c56107794e301a35f0d0e39a6ac6376155ab) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(agents): error on output schema validation failure instead of silent fallback

- [#2355](https://github.com/vertz-dev/vertz/pull/2355) [`815ad78`](https://github.com/vertz-dev/vertz/commit/815ad78cb56d671d7a288bcfd95f35e38331e889) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(agents): typed ctx.prev accumulation via builder pattern for workflow steps

- [#2362](https://github.com/vertz-dev/vertz/pull/2362) [`43f14ea`](https://github.com/vertz-dev/vertz/commit/43f14ea045503720f15bacf3166edfc811ca71b4) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(agents): add errorReason to WorkflowResult for debugging workflow failures

## 0.2.42

### Patch Changes

- [#2137](https://github.com/vertz-dev/vertz/pull/2137) [`9989471`](https://github.com/vertz-dev/vertz/commit/99894712ae2e811b8b0fec7d7ae88a235d87ab88) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add agent persistence layer: pluggable `AgentStore` interface with `memoryStore`, `sqliteStore`, and `d1Store` implementations. `run()` now supports session resumption via discriminated union options, with session ownership enforcement and message pruning via `maxStoredMessages`.

- [#2148](https://github.com/vertz-dev/vertz/pull/2148) [`d38bb01`](https://github.com/vertz-dev/vertz/commit/d38bb0156d01d2737b4a9e02c45dff4a58404f6e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add multi-step workflow orchestration: `workflow()` and `step()` factories for defining sequential agent pipelines, `runWorkflow()` execution engine with approval gates (suspend/resume), step output schema validation, and agent-to-agent invocation via `ctx.agents.invoke()`.

- [#2184](https://github.com/vertz-dev/vertz/pull/2184) [`b7fea81`](https://github.com/vertz-dev/vertz/commit/b7fea81bdb2cae7054ac9dbcf194ee4d11264350) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add token budget tracking, parallel tool execution, context compression hooks, and tool call summary to the ReAct loop. Expand LoopStatus with 'token-budget-exhausted' and 'diminishing-returns' exit statuses.

- Updated dependencies [[`3817268`](https://github.com/vertz-dev/vertz/commit/381726859926747bb460433e629a52d5277cb3ad)]:
  - @vertz/server@0.2.42
  - @vertz/errors@0.2.42
  - @vertz/schema@0.2.42
