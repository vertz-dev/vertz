# @vertz/agents

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
