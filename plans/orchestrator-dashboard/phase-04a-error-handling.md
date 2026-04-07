# Phase 4a: Error Handling & Run Management

## Context

This phase adds robust error handling for failed workflows and lifecycle management (cancel, retry, filtering, pagination). Builds on the live monitoring from Phase 1.

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 1

---

## Task 1: Add error detail to failed steps

**Files:** (4)
- `sites/dev-orchestrator/src/api/services/workflow-store.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/lib/workflow-executor.ts` (modified)
- `sites/dev-orchestrator/src/ui/pages/step-inspector.tsx` (modified)

**What to implement:**

Enhance the workflow store to capture error details when steps fail:
- Error message and error reason (from `WorkflowResult.errorReason`)
- Last tool call before failure (if applicable)
- Stack trace (if available from caught errors)

Update step inspector UI to show error details for failed steps:
- Red error banner with the error message
- "Last Tool Call" section showing what the agent was doing when it failed
- Error reason badge (agent-failed, invalid-json, schema-mismatch)

**Acceptance criteria:**
- [ ] Failed steps store error message and reason
- [ ] Step inspector shows error details for failed steps
- [ ] Error reason is displayed as a badge
- [ ] Last tool call before failure is shown (if available)

---

## Task 2: Add cancel and retry workflow actions

**Files:** (4)
- `sites/dev-orchestrator/src/lib/workflow-executor.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.test.ts` (modified)
- `sites/dev-orchestrator/src/ui/pages/workflow-detail.tsx` (modified)

**What to implement:**

Add `cancel` and `retry` actions to the workflow service:

```typescript
cancel: {
  method: 'POST',
  body: s.object({ id: s.string() }),
  response: s.object({ cancelled: s.boolean() }),
  handler(input) { /* abort running workflow, set status to 'cancelled' */ },
}

retry: {
  method: 'POST',
  body: s.object({ id: s.string() }),
  response: workflowRunSchema,
  handler(input) { /* create new run with same input, start execution */ },
}
```

Cancel uses an `AbortController` signal passed through the workflow executor.
Retry creates a new workflow run with the same input parameters.

UI: Add "Cancel" button (visible when running) and "Retry" button (visible when failed) to the workflow detail page header.

**Acceptance criteria:**
- [ ] `POST /api/workflows/cancel` cancels a running workflow
- [ ] Cancelled workflows show status 'cancelled' in the dashboard
- [ ] `POST /api/workflows/retry` creates a new run with same input
- [ ] Cancel button visible only for running/waiting-approval workflows
- [ ] Retry button visible only for failed/cancelled workflows

---

## Task 3: Add run status filters and pagination

**Files:** (3)
- `sites/dev-orchestrator/src/ui/pages/dashboard.tsx` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflow-store.ts` (modified)

**What to implement:**

Update the dashboard list page:
- Add filter tabs: All | Running | Completed | Failed
- Add pagination: 20 runs per page, prev/next buttons
- Update the `list` action to accept filter and pagination params:

```typescript
list: {
  method: 'POST',
  body: s.object({
    status: s.enum(['all', 'running', 'completed', 'failed']).optional(),
    page: s.number().optional(),
    pageSize: s.number().optional(),
  }),
  response: s.object({
    runs: s.array(workflowRunSchema),
    total: s.number(),
    page: s.number(),
    pageSize: s.number(),
  }),
}
```

Update workflow store:
- Add `list(filter?, page?, pageSize?)` with filtering and pagination
- Enforce 100-run max retention (FIFO eviction of oldest completed runs)

**Acceptance criteria:**
- [ ] Filter tabs show correct counts and filter the list
- [ ] Pagination shows 20 runs per page with prev/next
- [ ] Total count is correct for each filter
- [ ] Store evicts oldest completed runs when exceeding 100
- [ ] Real-time SSE updates still work with filters active
