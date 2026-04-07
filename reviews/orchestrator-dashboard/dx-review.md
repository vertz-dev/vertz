# DX Review: Orchestrator Dashboard Design Doc

**Reviewer:** DX Agent
**Date:** 2026-04-07
**Verdict:** **APPROVED with should-fix items**

---

## What's Good

- **Page structure is clean and predictable.** The URL hierarchy (`/workflows/:id`, `/definitions/:name`, `/agents/:name`) follows RESTful conventions. A developer seeing these routes for the first time would know exactly what to expect.
- **SSE over WebSocket is the right call.** For a read-only monitoring dashboard, SSE is simpler to implement, debug, and reconnect. Good tradeoff.
- **Component decomposition is sensible.** `WorkflowTimeline`, `StepCard`, `ArtifactViewer`, `ToolCallLog` — each has a single responsibility and a clear data contract. No god-components.
- **E2E acceptance tests are well-structured.** The BDD scenarios cover the core flows and include a negative test (drag in read-only mode). They read like a user story.
- **Phase dependency diagram is clear.** The parallel tracks (Phase 1 + Phase 2) and the convergence points are explicit.
- **Non-goals are honest.** No mobile, no multi-tenant, no persistence — all correct for an internal tool v1.

---

## Findings

### Should-Fix

**SF-1: API inconsistency — GET vs POST for read-only endpoints**
Some read-only endpoints use GET while others use POST. The mix is confusing.
**Resolution:** Standardized all endpoints to POST (Vertz server convention) except SSE stream (GET).

**SF-2: `StepDetail` name collision**
`StepDetail` used for both runtime data and definition detail.
**Resolution:** Renamed runtime type to `StepRunDetail`.

**SF-3: `StepProgressEvent` status union is underspecified**
The `status` field mixed event types ('iteration', 'tool-call') with statuses. These are different concepts.
**Resolution:** Changed to `type` field with explicit mapping to `StepCard.status` documented.

**SF-4: Artifact type enum is too narrow**
Hard-coded types prevent extensibility.
**Resolution:** Added `| (string & {})` to the union.

**SF-5: Canvas dependency for v1 is premature**
DOM-based diagram is simpler for <50 nodes.
**Resolution:** Switched to DOM-based (`<div>` + SVG edges).

**SF-6: No SSE reconnection strategy**
No specification for error handling, reconnection, or catch-up.
**Resolution:** Added reconnection strategy (snapshot-on-connect, heartbeat, EventSource auto-reconnect).

### Nits (all addressed)

- N-1: PromptEditor naming -> split into PromptInspector + PromptEditor
- N-2: Missing artifact id -> added `id` field
- N-3: toolInput/output as strings -> changed to `unknown`
- N-4: Type flow map is prose -> added monomorphic note
