---
'@vertz/agents': patch
---

fix(agents): remove broken `approval` and `execution` tool config fields

Both fields were declared on `ToolConfig` / `ToolDefinition` but had no real runtime behavior:

- `approval` was preserved through `tool()` but the ReAct loop never checked it, so an agent that set `approval: { required: true }` on a destructive tool would execute anyway. A security footgun in the type surface.
- `execution: 'client'` caused the loop to return an error tool message ("cannot be executed on the server") with no protocol for host round-trip. The feature was never implemented.

Both fields are now removed from the public type surface along with the `ToolApprovalConfig` and `ToolExecution` type exports. The misleading "client-side tool" runtime error is replaced with a clearer "tool has no handler" message pointing at the `ToolProvider` option.

Workflow step approval (`StepApprovalConfig` on `workflow().step({ approval })`) is a separate, working feature and is unchanged.

A proper suspend/resume protocol covering human-in-the-loop approval and client-side tool round-trips will be designed alongside the Durable Object runtime work, where per-session persistence is transactional.
