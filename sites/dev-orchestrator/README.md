# Dev Orchestrator

Internal dogfood app for developing Vertz against a real workflow-heavy application.

Current intent:

- keep the app inside the Vertz monorepo for faster framework iteration
- keep development and tests on `vtz` so runtime/test-runner gaps stay visible

Known temporary gaps:

- this checkout does not yet expose a local `vtz` workspace binary, so the app depends on the published `vertz` package for the `vtz` command
- this checkout's local Vertz workspace packages are behind the published runtime/API set used by this app, so the app is currently pinned to published Vertz package versions instead of `workspace:*`
