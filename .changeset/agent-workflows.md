---
'@vertz/agents': patch
---

Add multi-step workflow orchestration: `workflow()` and `step()` factories for defining sequential agent pipelines, `runWorkflow()` execution engine with approval gates (suspend/resume), step output schema validation, and agent-to-agent invocation via `ctx.agents.invoke()`.
