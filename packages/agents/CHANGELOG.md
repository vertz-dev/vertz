# @vertz/agents

## 0.2.42

### Patch Changes

- [#2137](https://github.com/vertz-dev/vertz/pull/2137) [`9989471`](https://github.com/vertz-dev/vertz/commit/99894712ae2e811b8b0fec7d7ae88a235d87ab88) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add agent persistence layer: pluggable `AgentStore` interface with `memoryStore`, `sqliteStore`, and `d1Store` implementations. `run()` now supports session resumption via discriminated union options, with session ownership enforcement and message pruning via `maxStoredMessages`.

- [#2148](https://github.com/vertz-dev/vertz/pull/2148) [`d38bb01`](https://github.com/vertz-dev/vertz/commit/d38bb0156d01d2737b4a9e02c45dff4a58404f6e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add multi-step workflow orchestration: `workflow()` and `step()` factories for defining sequential agent pipelines, `runWorkflow()` execution engine with approval gates (suspend/resume), step output schema validation, and agent-to-agent invocation via `ctx.agents.invoke()`.

- [#2184](https://github.com/vertz-dev/vertz/pull/2184) [`b7fea81`](https://github.com/vertz-dev/vertz/commit/b7fea81bdb2cae7054ac9dbcf194ee4d11264350) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add token budget tracking, parallel tool execution, context compression hooks, and tool call summary to the ReAct loop. Expand LoopStatus with 'token-budget-exhausted' and 'diminishing-returns' exit statuses.

- Updated dependencies [[`3817268`](https://github.com/vertz-dev/vertz/commit/381726859926747bb460433e629a52d5277cb3ad)]:
  - @vertz/server@0.2.42
  - @vertz/errors@0.2.42
  - @vertz/schema@0.2.42
