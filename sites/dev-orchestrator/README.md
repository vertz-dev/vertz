# Dev Orchestrator

Internal dogfood app for developing Vertz against a real workflow-heavy application.

Current intent:

- keep the app inside the Vertz monorepo for faster framework iteration
- keep development and tests on `vtz` so runtime/test-runner gaps stay visible
- all `@vertz/*` dependencies use `workspace:*` resolution (local packages)

## Running

```bash
# Build all packages first (required for workspace resolution)
vtz run build

# Run tests
cd sites/dev-orchestrator && bun test

# Typecheck
tsc --noEmit
```

## Architecture

- **Agents:** planner, reviewer, implementer, ci-monitor (all use MiniMax-M2.7)
- **Workflow:** 8-step feature workflow (plan -> 3x review -> approval -> implement -> code review -> CI monitor)
- **Executor:** `WorkflowExecutor` bridges `runWorkflow()` from `@vertz/agents` with the in-memory workflow store
- **API:** REST services for dashboard and workflow management
