# Phase 1: Live Monitoring Upgrade

## Context

Phase 0 established step progress events and SSE streaming. This phase builds the dashboard UI: replacing the 3s polling with live SSE updates, adding step detail inspection, artifact viewing, and component extraction.

The dev-orchestrator already has a basic dashboard with workflow list, trigger, and detail pages. This phase upgrades the detail page and adds new components.

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 0

---

## Task 1: Add step-detail and artifacts API endpoints

**Files:** (4)
- `sites/dev-orchestrator/src/api/services/workflows.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflow-store.ts` (modified)
- `sites/dev-orchestrator/src/api/services/workflows.test.ts` (new or modified)
- `sites/dev-orchestrator/src/api/services/workflow-store.test.ts` (new or modified)

**What to implement:**

Add two new service actions to the workflow service:

```typescript
// POST /api/workflows/step-detail
// Returns: StepRunDetail (iterations, token usage, tool calls, response, timing)
stepDetail: {
  method: 'POST',
  body: s.object({ runId: s.string(), step: s.string() }),
  response: stepRunDetailSchema,
  handler(input) { ... },
}

// POST /api/workflows/artifacts
// Returns: WorkflowArtifact[] (design docs, reviews, code produced by the run)
artifacts: {
  method: 'POST',
  body: s.object({ runId: s.string() }),
  response: s.object({ artifacts: s.array(artifactSchema) }),
  handler(input) { ... },
}
```

The workflow store needs to be enhanced to track per-step detail (iterations, timing) and artifacts. Update `WorkflowRun.steps` to include richer data.

**Acceptance criteria:**
- [ ] `POST /api/workflows/step-detail` returns step run detail with iterations, duration, response
- [ ] `POST /api/workflows/artifacts` returns artifacts produced by the workflow run
- [ ] Store captures step start/end timestamps from progress events
- [ ] Returns empty arrays for runs with no artifacts
- [ ] Returns 404-equivalent (null) for unknown run/step combinations

---

## Task 2: Create SSE client helper for the frontend

**Files:** (2)
- `sites/dev-orchestrator/src/ui/lib/sse-client.ts` (new)
- `sites/dev-orchestrator/src/ui/lib/sse-client.test.ts` (new)

**What to implement:**

Create a typed SSE client helper that wraps `EventSource`:

```typescript
import { s } from '@vertz/schema';

const stepProgressSchema = s.object({
  step: s.string(),
  type: s.enum(['step-started', 'step-completed', 'step-failed']),
  timestamp: s.number(),
  iterations: s.number().optional(),
  response: s.string().optional(),
});

export function createWorkflowStream(runId: string): {
  subscribe(listener: (event: StepProgressEvent) => void): () => void;
  close(): void;
};
```

- Uses `EventSource` for auto-reconnection
- Validates incoming events with `@vertz/schema` before passing to listener
- Logs and discards invalid payloads
- Handles `snapshot` events on connect

**Acceptance criteria:**
- [ ] Wraps EventSource with typed event parsing
- [ ] Validates payloads against schema, discards invalid
- [ ] Returns unsubscribe function
- [ ] `close()` cleanly disconnects the EventSource

---

## Task 3: Create StepCard component

**Files:** (2)
- `sites/dev-orchestrator/src/ui/components/step-card.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/step-card.test.ts` (new)

**What to implement:**

Extract step rendering into a reusable `StepCard` component:

```typescript
interface StepCardProps {
  readonly name: string;
  readonly status: 'pending' | 'active' | 'completed' | 'failed';
  readonly agent?: string;
  readonly iterations?: number;
  readonly duration?: number;
  readonly artifacts?: readonly string[];
  readonly onClick?: () => void;
}
```

Uses `@vertz/ui/components` (Card, Badge) with status-based styling:
- `pending`: gray badge, muted text
- `active`: blue badge, spinner/pulse
- `completed`: green badge, checkmark
- `failed`: red badge, X icon

**Acceptance criteria:**
- [ ] Renders step name, agent, and status badge
- [ ] Shows iteration count and duration for completed/failed steps
- [ ] Shows artifact count if artifacts exist
- [ ] Fires `onClick` when clicked
- [ ] Displays spinner/pulse animation for active status

---

## Task 4: Create ArtifactViewer and ToolCallLog components

**Files:** (4)
- `sites/dev-orchestrator/src/ui/components/artifact-viewer.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/artifact-viewer.test.ts` (new)
- `sites/dev-orchestrator/src/ui/components/tool-call-log.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/tool-call-log.test.ts` (new)

**What to implement:**

`ArtifactViewer` — renders markdown content:
```typescript
interface ArtifactViewerProps {
  readonly path: string;
  readonly content: string;
  readonly type: string;
}
```
- Uses `marked` to convert markdown to HTML
- Wraps in a Card with the file path as header
- Applies basic code syntax highlighting via `marked`'s default highlighter

`ToolCallLog` — expandable list of tool invocations:
```typescript
interface ToolCallLogProps {
  readonly calls: readonly ToolCallRecord[];
  readonly expanded?: boolean;
}
```
- Accordion-style: collapsed by default, expand to see input/output
- Shows tool name and duration for each call
- Input/output rendered as JSON code blocks

**Acceptance criteria:**
- [ ] ArtifactViewer renders markdown as HTML
- [ ] ArtifactViewer shows file path as header
- [ ] ToolCallLog shows tool calls in expandable list
- [ ] Each tool call shows name, duration, and expandable input/output
- [ ] Collapsed by default, click to expand individual calls

---

## Task 5: Upgrade workflow detail page with SSE + step inspection

**Files:** (3)
- `sites/dev-orchestrator/src/ui/pages/workflow-detail.tsx` (modified)
- `sites/dev-orchestrator/src/ui/pages/step-inspector.tsx` (new)
- `sites/dev-orchestrator/src/ui/pages/workflow-detail.test.ts` (modified or new)

**What to implement:**

Upgrade the workflow detail page:
1. Replace 3s polling with SSE via `createWorkflowStream()`
2. Render `WorkflowTimeline` (vertical list of `StepCard` components)
3. On step click, navigate to `/workflows/:id/steps/:step`

Create step inspector page:
1. Fetches step detail via `POST /api/workflows/step-detail`
2. Shows `StepCard` header with full detail
3. Shows `ArtifactViewer` for each artifact
4. Shows `ToolCallLog` for tool calls
5. Back button to workflow detail

**Acceptance criteria:**
- [ ] Workflow detail page updates in real time as steps complete (no 3s delay)
- [ ] Steps render as a vertical timeline with status badges
- [ ] Clicking a step navigates to step inspector
- [ ] Step inspector shows iterations, duration, response
- [ ] Step inspector shows artifacts with rendered markdown
- [ ] Step inspector shows tool calls in expandable log
- [ ] Existing trigger functionality still works
