# Phase 1: Live Monitoring Upgrade

- **Author:** claude-opus
- **Reviewer:** claude-opus-reviewer
- **Commits:** 9d30eb3fa..1f20db7d8
- **Date:** 2026-04-07

## Changes

- `sites/dev-orchestrator/src/components/step-card.tsx` (new)
- `sites/dev-orchestrator/src/components/step-card-types.ts` (new)
- `sites/dev-orchestrator/src/components/step-card-utils.ts` (new)
- `sites/dev-orchestrator/src/components/step-card.test.ts` (new)
- `sites/dev-orchestrator/src/components/artifact-viewer.tsx` (new)
- `sites/dev-orchestrator/src/components/artifact-viewer-utils.ts` (new)
- `sites/dev-orchestrator/src/components/artifact-viewer.test.ts` (new)
- `sites/dev-orchestrator/src/components/tool-call-log.tsx` (new)
- `sites/dev-orchestrator/src/components/tool-call-log-utils.ts` (new)
- `sites/dev-orchestrator/src/components/tool-call-log.test.ts` (new)
- `sites/dev-orchestrator/src/pages/step-inspector.tsx` (new)
- `sites/dev-orchestrator/src/pages/step-inspector-utils.ts` (new)
- `sites/dev-orchestrator/src/pages/step-inspector.test.ts` (new)
- `sites/dev-orchestrator/src/pages/workflow-detail.test.ts` (new)
- `sites/dev-orchestrator/src/ui/lib/sse-client.ts` (new)
- `sites/dev-orchestrator/src/ui/lib/sse-client.test.ts` (new)
- `sites/dev-orchestrator/src/api/services/workflows.test.ts` (new)
- `sites/dev-orchestrator/src/pages/workflow-detail.tsx` (modified)
- `sites/dev-orchestrator/src/router.tsx` (modified)
- `sites/dev-orchestrator/src/lib/sdk.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflow-store.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflow-stream.test.ts` (modified)
- `sites/dev-orchestrator/src/api/services/__tests__/workflows.test.ts` (modified)
- `sites/dev-orchestrator/src/api/services/__tests__/workflows-integration.test.ts` (modified)
- `sites/dev-orchestrator/src/lib/workflow-executor.ts` (modified)
- `sites/dev-orchestrator/src/lib/workflow-executor.test.ts` (modified)
- `sites/dev-orchestrator/src/lib/__tests__/workflow-executor.test.ts` (modified)

## CI Status

- [x] Tests pass (194 pass, 0 fail)
- [x] Typecheck clean (only pre-existing tools/__tests__ errors)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance
- [x] No type gaps or missing edge cases
- [ ] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER-1: SSE EventSource is never closed in `workflow-detail.tsx` -- resource leak

**File:** `sites/dev-orchestrator/src/pages/workflow-detail.tsx`, lines 81-84

The SSE stream is created eagerly at the module scope of the component function but `stream.close()` is never called. When the user navigates away from the workflow detail page, the EventSource remains open, accumulating connections on the server and leaking memory on the client.

```typescript
// Line 81-84 -- stream opens but never closes
const stream = createWorkflowStream(id);
stream.subscribe((event) => {
  sseEvents = [...sseEvents, event];
});
```

Per the integration-test-safety rules, every async resource must be cleaned up. In the Vertz component model, the component needs to use `lifecycleEffect()` or the component's teardown hook to call `stream.close()` when unmounted.

**Classification:** BLOCKER -- This is a resource leak that compounds on every page navigation. Multiple open EventSource connections will exhaust server resources and cause duplicate event processing.

---

### BLOCKER-2: `workflow-detail.test.ts` duplicates `stepStatus` instead of importing it

**File:** `sites/dev-orchestrator/src/pages/workflow-detail.test.ts`

The test file contains this comment on line 4:

```typescript
// Cannot import stepStatus from .tsx directly (JSX runtime issue).
// Re-implement the pure function here for testing, mirroring the actual logic.
// The source of truth is workflow-detail.tsx:stepStatus.
```

The entire `stepStatus` function and the `WORKFLOW_STEPS` constant are re-implemented in the test file. This means the test is NOT testing the actual production code -- it is testing a copy. If the real `stepStatus` in `workflow-detail.tsx` drifts from this copy, tests would still pass while the production code is broken.

**Fix:** Extract `stepStatus` and `WORKFLOW_STEPS` into a separate `workflow-detail-utils.ts` file (like the pattern used for step-inspector-utils, step-card-utils, etc.) and import from there in both the component and the test. This pattern is already used consistently elsewhere in this PR.

**Classification:** BLOCKER -- Tests are not testing actual production code. They test a copy that can silently drift.

---

### SHOULD-FIX-1: ToolCallLog in step-inspector renders hardcoded empty array

**File:** `sites/dev-orchestrator/src/pages/step-inspector.tsx`, line 111

```typescript
<ToolCallLog calls={[]} />
```

The ToolCallLog always receives an empty array. The `StepRunDetail` type has no `toolCalls` field, so tool call data is never fetched, stored, or displayed. The acceptance criterion "Step inspector shows tool calls in expandable log" from the phase plan (Task 5) is not actually met -- the component renders "No tool calls" unconditionally.

This means the ToolCallLog component exists and has tests for its utils, but is never wired to real data. Users will always see "No tool calls" regardless of what happened.

**Classification:** SHOULD-FIX -- The component infrastructure is in place, but it needs to be wired to real data (either by adding a `toolCalls` field to `StepRunDetail` or a separate endpoint). If tool call data is intentionally deferred to a later phase, this should be documented with a TODO comment.

---

### SHOULD-FIX-2: ArtifactViewer does not render markdown as HTML

**File:** `sites/dev-orchestrator/src/components/artifact-viewer.tsx`, lines 45-46

The phase plan (Task 4) states: "Uses `marked` to convert markdown to HTML" and the acceptance criterion is "ArtifactViewer renders markdown as HTML."

The actual implementation renders markdown content as plain text inside a `<div>`:

```tsx
{markdown ? (
  <div style={styles.body}>{content}</div>
) : (
  <pre style={styles.pre}>{escapeHtml(content)}</pre>
)}
```

No markdown-to-HTML conversion happens. The `marked` library is not imported or used. Design docs and review files (the primary artifacts) are markdown, so they will display as raw markdown source text rather than rendered content.

**Classification:** SHOULD-FIX -- The feature works (content is displayed) but does not meet the design doc specification. Adding `marked` or a similar markdown renderer would significantly improve readability of artifact content.

---

### SHOULD-FIX-3: `StepRunDetail.status` is typed as `string` instead of a union

**File:** `sites/dev-orchestrator/src/api/services/workflows.ts`, line 12

```typescript
export interface StepRunDetail {
  readonly status: string;  // Too broad
  ...
}
```

The `stepStatusFromDetail()` function in `step-inspector-utils.ts` switches on specific values (`'complete'`, `'failed'`, `'running'`) but the type allows any string. This means:

1. No TypeScript exhaustiveness checking on the switch.
2. A typo like `'completed'` vs `'complete'` won't be caught at compile time.
3. The `stepRunDetailSchema` also uses `s.string()` for status rather than `s.enum()`.

**Fix:** Change to `status: 'pending' | 'running' | 'complete' | 'failed'` and update the schema to `s.enum(['pending', 'running', 'complete', 'failed'])`.

**Classification:** SHOULD-FIX -- The code works at runtime but misses an opportunity for compile-time safety that would prevent status string mismatches.

---

### SHOULD-FIX-4: StepCard has `role="button"` and `tabIndex={0}` but no keyboard handler

**File:** `sites/dev-orchestrator/src/components/step-card.tsx`, line 84

```tsx
<div style={cardStyle} onClick={onClick} role="button" tabIndex={0}>
```

The element has `role="button"` and `tabIndex={0}` (making it focusable), but there is no `onKeyDown` or `onKeyPress` handler for Enter/Space. Screen reader and keyboard users can focus the element but cannot activate it without a mouse.

**Fix:** Add `onKeyDown` handler that calls `onClick` on Enter or Space keys.

**Classification:** SHOULD-FIX -- Accessibility issue. The `role="button"` contract requires keyboard activation.

---

### SHOULD-FIX-5: `truncateJson()` is exported and tested but never used

**File:** `sites/dev-orchestrator/src/components/tool-call-log-utils.ts`, line 17

The `truncateJson` function is defined, exported, and has 3 tests, but it is never imported or called anywhere in the codebase. It appears to have been intended for truncating long tool call inputs/outputs in the ToolCallLog, but since the ToolCallLog always receives `calls={[]}`, it was never wired up.

**Classification:** SHOULD-FIX -- Dead code. Either wire it into the ToolCallLog component or remove it (and its tests) to avoid maintaining unused code.

---

### SHOULD-FIX-6: `refetchInterval: 10000` still active alongside SSE

**File:** `sites/dev-orchestrator/src/pages/workflow-detail.tsx`, line 77

```typescript
const workflowQuery = query(
  () => sdk.workflows.get({ id }),
  { refetchInterval: 10000 },
);
```

The phase plan says "Replace 3s polling with SSE" (Task 5). The original 3s polling has been replaced with 10s polling, but polling still exists alongside the SSE stream. This means the page makes an HTTP request every 10 seconds even though it's receiving real-time SSE events.

If the intent is to keep polling as a fallback/sync mechanism, the interval should be documented. If SSE is the primary update mechanism, the polling should be removed (or significantly increased, e.g., 60s).

**Classification:** SHOULD-FIX -- The 10s polling partially contradicts the "replace polling with SSE" goal. It wastes network requests when SSE is working correctly.

---

### NIT-1: Path deviation from phase plan

The phase plan specifies files at `src/ui/components/` and `src/ui/pages/` but the actual files are at `src/components/` and `src/pages/`. The SSE client is correctly at `src/ui/lib/sse-client.ts` as planned. This inconsistency is minor -- the chosen paths (`src/components/`, `src/pages/`) are cleaner and more conventional -- but should be noted as a deviation from the plan.

---

### NIT-2: `formatDuration` and `formatToolDuration` are identical functions

**Files:** `step-card-utils.ts` line 12 and `tool-call-log-utils.ts` line 12

Both files contain the same implementation:

```typescript
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
```

Consider extracting into a shared utility to avoid duplication.

---

### NIT-3: `as any` usage in test mock contexts

Multiple test files use `{} as any` for mock handler contexts. This is acceptable in test code for mocking framework contexts, but worth noting. Each instance has been checked and none involve production code.

---

### NIT-4: `escapeHtml` is called in JSX text position

**File:** `artifact-viewer.tsx`, line 48

```tsx
<pre style={styles.pre}>{escapeHtml(content)}</pre>
```

In JSX, text content is already escaped by the framework. Calling `escapeHtml()` here will double-escape: `<div>` becomes `&amp;lt;div&amp;gt;` in the rendered output. This would make code artifacts display incorrectly (showing `&lt;` instead of `<`).

For non-markdown content, simply `{content}` would be correct, as Vertz's JSX runtime handles escaping.

**Classification:** Reclassified to SHOULD-FIX -- This is a correctness bug that will cause code artifacts to display incorrectly.

---

## Summary

| Classification | Count |
|---------------|-------|
| BLOCKER       | 2     |
| SHOULD-FIX    | 7 (including NIT-4 reclassified) |
| NIT           | 3     |

### Blockers requiring action before merge:

1. **SSE stream never closed** -- Add cleanup/teardown for the EventSource in workflow-detail.tsx
2. **Test duplicates production code** -- Extract `stepStatus` and `WORKFLOW_STEPS` into a utils file and import in both component and test

### Key should-fix items:

1. ToolCallLog always empty -- wire to real data or add TODO
2. ArtifactViewer does not render markdown -- add markdown rendering
3. `StepRunDetail.status` too loosely typed -- use union type
4. StepCard missing keyboard handler -- accessibility issue
5. `escapeHtml` double-escapes in JSX -- remove the call
6. Dead `truncateJson` code -- wire or remove
7. Polling still active alongside SSE -- remove or document

## Resolution

*To be filled after fixes.*
