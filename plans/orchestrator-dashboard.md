# Orchestrator Dashboard — Design Doc

## Overview

A full-featured dashboard for the dev-orchestrator that lets users monitor running workflows in real time, inspect artifacts, view workflow definitions as interactive flow diagrams, edit workflow configurations, and trigger new runs. Built entirely with Vertz (UI + server + Bun runtime).

---

## 1. API Surface

### 1.1 Backend — New API Endpoints

All endpoints use POST with JSON bodies, following the `@vertz/server` service action pattern. The only exception is the SSE stream endpoint (GET), since SSE requires a persistent GET connection.

```typescript
// --- Workflow Runs (extend existing service) ---

// Stream step-by-step progress via SSE
// GET /api/workflows/:id/stream
// Returns: Server-Sent Events with StepProgressEvent payloads
//
// On connect: sends a 'snapshot' event with current run state.
// On reconnect: client re-subscribes; server sends a fresh snapshot.
// Heartbeat: server sends a 'heartbeat' comment every 30s.
interface StepProgressEvent {
  readonly step: string;
  readonly type: 'step-started' | 'iteration' | 'tool-call' | 'step-completed' | 'step-failed';
  readonly iteration?: number;
  readonly totalIterations?: number;
  readonly toolName?: string;
  readonly toolInput?: unknown;
  readonly response?: string;
  readonly timestamp: number;
}

// StepProgressEvent.type → StepCard.status mapping:
//   'step-started'   → 'active'
//   'iteration'      → 'active'  (update iteration count)
//   'tool-call'      → 'active'  (append to tool call log)
//   'step-completed' → 'completed'
//   'step-failed'    → 'failed'

// Get artifacts produced by a workflow run
// POST /api/workflows/artifacts
interface WorkflowArtifactsInput {
  readonly runId: string;
}
interface WorkflowArtifact {
  readonly id: string;
  readonly path: string;
  readonly type: 'design-doc' | 'review' | 'implementation-summary' | 'code' | (string & {});
  readonly content: string;
  readonly step: string;
  readonly createdAt: number;
}

// Get detailed step results (tool calls, iterations, token usage)
// POST /api/workflows/step-detail
interface StepDetailInput {
  readonly runId: string;
  readonly step: string;
}
interface StepRunDetail {
  readonly step: string;
  readonly status: string;
  readonly iterations: number;
  readonly tokenUsage: { prompt: number; completion: number };
  readonly toolCalls: readonly ToolCallRecord[];
  readonly response: string;
  readonly startedAt: number;
  readonly completedAt: number;
}
interface ToolCallRecord {
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly duration: number;
}

// --- Workflow Definitions (new service) ---

// List all registered workflow definitions
// POST /api/definitions/list
interface WorkflowDefinitionSummary {
  readonly name: string;
  readonly stepCount: number;
  readonly steps: readonly StepSummary[];
}
interface StepSummary {
  readonly name: string;
  readonly agent: string | null;
  readonly isApproval: boolean;
  readonly hasOutput: boolean;
}

// Get full workflow definition with agent details
// POST /api/definitions/get
interface WorkflowDefinitionDetail extends WorkflowDefinitionSummary {
  readonly inputSchema: object;
  readonly steps: readonly StepDefinitionDetail[];
}
interface StepDefinitionDetail extends StepSummary {
  readonly agentDetail: AgentDetail | null;
  readonly outputSchema: object | null;
  readonly approvalConfig: { message: string; timeout?: string } | null;
}
interface AgentDetail {
  readonly name: string;
  readonly description: string;
  readonly model: { provider: string; model: string };
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly maxIterations: number;
  readonly tokenBudget: number;
}

// --- Agent Registry (extend dashboard service) ---

// Get agent detail including prompt and tools
// POST /api/agents/get
interface AgentDetailInput {
  readonly name: string;
}
// Returns: AgentDetail (above)
```

### 1.2 Frontend — Page Structure

```
/                           -> Dashboard (workflow runs overview)
/workflows/:id              -> Workflow Run Detail (live monitoring)
/workflows/:id/steps/:step  -> Step Inspector (tool calls, artifacts)
/definitions                 -> Workflow Definitions list
/definitions/:name           -> Flow Diagram view
/definitions/:name/steps/:step -> Step definition detail
/agents                      -> Agent Registry
/agents/:name                -> Agent Detail (prompt, tools, config)
```

### 1.3 Frontend — Key Components

```typescript
// --- Live Monitoring ---

// WorkflowTimeline: vertical step timeline with live status
<WorkflowTimeline
  runId={id}
  steps={steps}
  currentStep={currentStep}
  onStepClick={(step) => navigate({ to: `/workflows/${id}/steps/${step}` })}
/>

// StepCard: individual step in the timeline
<StepCard
  name="plan"
  status="completed"          // pending | active | completed | failed
  agent="planner"
  iterations={8}
  duration={45_000}
  artifacts={['plans/issue-1748.md']}
/>

// ArtifactViewer: renders markdown content with syntax highlighting
<ArtifactViewer
  path="plans/issue-1748.md"
  content={markdownContent}
  type="design-doc"
/>

// ToolCallLog: expandable log of tool calls for a step
<ToolCallLog
  calls={toolCalls}
  expanded={false}
/>

// --- Flow Diagram (DOM-based) ---

// WorkflowDiagram: DOM-based flow visualization
// Uses styled <div> nodes with SVG <line> edges.
// Not canvas-based — see Tradeoffs section.
<WorkflowDiagram
  definition={workflowDef}
  activeRun={currentRun}       // optional — highlights active step
  onStepSelect={(step) => ...}
/>

// StepNode: a single node in the flow diagram
interface StepNodeProps {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly status?: 'pending' | 'active' | 'completed' | 'failed';
  readonly selected: boolean;
}

// EdgeLine: SVG connection between two step nodes
interface EdgeLineProps {
  readonly from: string;  // step name (layout is auto-computed)
  readonly to: string;
  readonly animated: boolean;    // CSS pulse animation for active transitions
}

// --- Definition Inspector ---

// PromptInspector: read-only markdown viewer for agent system prompts
// (renamed from PromptEditor — editing comes in Phase 3)
<PromptInspector
  value={systemPrompt}
  variables={['issueNumber', 'repo']}  // highlights template vars
/>

// PromptEditor: extends PromptInspector with editing (Phase 3)
<PromptEditor
  value={systemPrompt}
  onChange={(v) => ...}
  variables={['issueNumber', 'repo']}
/>

// StepConfigPanel: side panel for editing step properties
<StepConfigPanel
  step={selectedStep}
  agents={availableAgents}
  onUpdate={(changes) => ...}
/>
```

---

## 2. Manifesto Alignment

### Principles Applied

| Principle | How it applies |
|-----------|---------------|
| **If it builds, it works** | All API contracts are typed end-to-end. Workflow definitions, step configs, and artifacts flow through `@vertz/schema` validation. SSE payloads are validated at the client with `@vertz/schema` before updating state. The UI uses typed queries — no raw fetch calls. |
| **One way to do things** | Single dashboard for all orchestrator operations. No separate CLI workflow, no external tools. The flow diagram IS the workflow definition — visual and code are the same artifact. |
| **AI agents are first-class users** | The dashboard is designed to be inspectable by agents. The step detail API exposes every tool call and iteration, making agent behavior auditable. Future: agents could use this dashboard via MCP to self-monitor. |
| **Performance is not optional** | SSE streaming for live updates (no 3-5s polling). Lazy loading for artifact content. DOM-based diagram performs well for <50 nodes (sufficient for current workflows). |
| **No ceilings** | DOM diagram can be migrated to `@vertz/ui-canvas` if workflows exceed 50+ nodes. Architecture is rendering-agnostic — `WorkflowDiagram` wraps the rendering strategy. |

### Tradeoffs

- **DOM diagram vs Canvas diagram** — DOM (`<div>` nodes + SVG edges) is simpler to implement, fully styled with CSS, interactive with native DOM events, and uses Vertz's reactive system directly. Canvas would only be needed for 100+ node diagrams. Since our workflows are 5-20 steps, DOM is the right choice. If we outgrow it, the `WorkflowDiagram` component can be re-implemented with canvas internals.
- **SSE vs WebSocket** — SSE is simpler (HTTP-based, auto-reconnect, one-directional) and sufficient since the dashboard only reads live data. WebSocket would add complexity for bidirectional capability we don't need yet.
- **Definition editing in UI vs code** — For v1, editing is read-only inspection with prompt editing. Full visual workflow building is a future milestone.

### What Was Rejected

- **External diagram library (React Flow, XYFlow)** — Not Vertz-native. Would require React compatibility layer and break our component model.
- **Canvas-based diagram for v1** — Premature. `@vertz/ui-canvas` Phase 2 (JSX) is still in design. Using the imperative Phase 1 API would produce throwaway code that contradicts Vertz's declarative conventions. DOM is simpler and exercises more of the Vertz reactive system (signals, computed, JSX).
- **GraphQL for the API** — Over-engineered for this use case. REST + SSE is simpler and aligns with the existing `@vertz/server` service pattern.
- **Separate "orchestrator" package** — The dashboard is part of `sites/dev-orchestrator`, not a reusable package. It's an internal tool, not a public API.

---

## 3. Non-Goals

- **Multi-tenant orchestrator** — This is a single-user/team developer tool. No auth, no tenant isolation. Role-based access is deferred to a future phase.
- **Visual workflow builder (drag-and-drop creation)** — v1 is read-only visualization + prompt editing. Full drag-and-drop workflow creation is a future milestone.
- **Persistent workflow history** — The current in-memory store is sufficient for v1. Runs are lost on server restart. Database-backed persistence is a separate concern.
- **Mobile-responsive layout** — This is a desktop developer tool. No mobile breakpoints.
- **Diff view for workflow changes** — No version control for workflow definitions in v1.
- **Custom theme for the dashboard** — Uses the standard Vertz zinc theme. No custom branding.

---

## 4. Unknowns

### Resolved

- **Canvas vs DOM for flow diagram** — All three reviewers (DX, Product, Technical) recommended DOM-based rendering for v1. Workflows are 5-20 steps, well within DOM performance. Canvas is premature. **Resolution:** DOM-based (`<div>` nodes + SVG edges). Migrate to canvas only if we hit DOM performance limits.

- **SSE runtime target** — The current dev-orchestrator runs on Bun (`Bun.serve()`), not the VTZ runtime. Bun natively supports SSE via streaming responses. **Resolution:** Phase 1 targets Bun. SSE is not an unknown on Bun — it works. Migration to VTZ runtime is a separate future concern.

- **Phase 3 dependency on Phase 2** — Product review correctly identified this coupling as artificial. The prompt editor doesn't require the flow diagram. **Resolution:** Phase 3 depends on Phase 1 (not Phase 2). The prompt editor is accessible from the workflow detail page and agent detail page.

### Open

- **Agent step progress granularity** — The current `run()` function returns a single result after all iterations complete. To stream per-iteration progress, we'd need to hook into the ReAct loop.
  - **Resolution path:** Phase 0 adds step-level progress events via `onStepProgress` callback on the workflow executor. Iteration-level streaming is deferred to a future phase (requires modifying `reactLoop()` core).

---

## 5. POC Results

No POC needed. All unknowns have been resolved:
- SSE works on Bun (confirmed by existing Bun streaming patterns)
- DOM-based diagram does not require a POC for <50 node workflows
- Canvas POC is deferred until workflows outgrow DOM rendering

---

## 6. Type Flow Map

All types in this design are monomorphic (no generic type parameters). Each type flows from backend definition to frontend rendering:

```
WorkflowDefinition (from @vertz/agents)
  -> WorkflowDefinitionSummary (API response, validated by @vertz/schema)
    -> WorkflowDiagram props (frontend component)
      -> StepNode[] + EdgeLine[] (DOM rendering)

WorkflowRun (from workflow-store)
  -> StepProgressEvent (SSE stream, validated by @vertz/schema on client)
    -> WorkflowTimeline props
      -> StepCard props (per-step UI)

StepRunDetail (API response, validated by @vertz/schema)
  -> ToolCallRecord[] (detailed iteration data)
    -> ToolCallLog props (expandable log UI)

WorkflowArtifact (API response, validated by @vertz/schema)
  -> ArtifactViewer props
    -> Rendered markdown (display)

AgentDetail (API response, validated by @vertz/schema)
  -> AgentDetail page props
    -> PromptInspector props (for system prompt viewing)
```

SSE validation: `StepProgressEvent` payloads are JSON-parsed and validated against a `@vertz/schema` schema on the client before updating reactive state. Invalid payloads are logged and discarded.

No generics means no `.test-d.ts` files are needed for type flow verification. Type safety is ensured by `@vertz/schema` validation at all API boundaries.

---

## 7. E2E Acceptance Test

### Scenario 1: Monitor a running workflow

```typescript
describe('Feature: Live workflow monitoring', () => {
  describe('Given a workflow run is in progress for issue #1748', () => {
    describe('When the user opens the dashboard', () => {
      it('Then the workflow appears in the active list with status "running"', () => {});
      it('Then the current step name is displayed (e.g., "review-dx")', () => {});
    });

    describe('When the user clicks on the workflow run', () => {
      it('Then a vertical timeline shows all 9 steps', () => {});
      it('Then completed steps show green checkmarks', () => {});
      it('Then the active step shows a spinner with iteration count', () => {});
      it('Then pending steps are grayed out', () => {});
    });

    describe('When the user clicks on a completed step', () => {
      it('Then the step detail panel shows iteration count and duration', () => {});
      it('Then artifacts produced by that step are listed with clickable links', () => {});
      it('Then expanding "Tool Calls" shows each tool invocation with input/output', () => {});
    });

    describe('When the user clicks on an artifact', () => {
      it('Then the artifact content renders as formatted markdown', () => {});
    });
  });
});
```

### Scenario 2: View workflow definition as flow diagram

```typescript
describe('Feature: Workflow flow diagram', () => {
  describe('Given the "feature" workflow definition', () => {
    describe('When the user navigates to /definitions/feature', () => {
      it('Then a DOM-based diagram renders 9 step nodes in sequential order', () => {});
      it('Then SVG edges connect each step to the next', () => {});
      it('Then agent steps show the agent name inside the node', () => {});
      it('Then the approval step has a distinct visual style (diamond/gate)', () => {});
    });

    describe('When the user clicks a step node', () => {
      it('Then a side panel opens with the step configuration', () => {});
      it('Then the agent system prompt is displayed in the panel', () => {});
      it('Then the tools available to the agent are listed', () => {});
    });
  });
});
```

### Scenario 3: Trigger and inspect a new workflow run

```typescript
describe('Feature: Trigger workflow from dashboard', () => {
  describe('Given the user is on the dashboard page', () => {
    describe('When the user enters issue number 1748 and clicks "Start Workflow"', () => {
      it('Then a new workflow run appears in the active list', () => {});
      it('Then the run status shows "running"', () => {});
      it('Then navigating to the run shows the plan step as active', () => {});
    });
  });
});
```

### Scenario 4: Inspect agent configuration

```typescript
describe('Feature: Agent detail inspection', () => {
  describe('Given the user navigates to /agents/planner', () => {
    it('Then the agent name, description, and model are displayed', () => {});
    it('Then the system prompt is shown in a scrollable viewer', () => {});
    it('Then the available tools are listed with their input/output schemas', () => {});
    it('Then loop config (maxIterations, tokenBudget) is displayed', () => {});
  });
});
```

---

## 8. Implementation Plan

### Phase 0: Workflow Progress Events (prerequisite)

**Goal:** Add step-level progress event emission to the workflow executor in `@vertz/agents`.

**Tasks:**
1. Add `onStepProgress` callback to the workflow executor options
2. Emit `step-started` and `step-completed`/`step-failed` events as each step runs
3. Wire the orchestrator's workflow runner to emit events to the in-memory store

**Acceptance criteria:**
- Workflow executor emits typed progress events as steps execute
- Events include step name, status, timestamp
- Existing workflow execution behavior is unchanged (callback is optional)

### Phase 1: Live Monitoring Upgrade (foundation)

**Goal:** Replace polling with SSE streaming, add step detail inspection and artifact viewing.

**Runtime target:** Bun (`Bun.serve()`) — the current dev-orchestrator runtime. SSE works natively.

**Markdown renderer:** `marked` (lightweight, fast, no dependencies). XSS is acceptable since all content is agent-generated within our own sandbox. If untrusted content is introduced later, add `DOMPurify`.

**Tasks:**
1. Add `GET /api/workflows/:id/stream` SSE endpoint using Bun streaming response
2. Add `POST /api/workflows/artifacts` and `POST /api/workflows/step-detail` endpoints
3. Implement SSE client helper (EventSource wrapper with `@vertz/schema` validation, snapshot-on-connect, 30s heartbeat)
4. Upgrade `workflow-detail.tsx` — replace 3s polling with SSE, add step click -> detail panel
5. Create `ArtifactViewer` component (markdown rendering via `marked`)
6. Create `ToolCallLog` component (expandable tool call list)
7. Create `StepCard` component (extracted from current inline step rendering)

**SSE reconnection strategy:**
- Client uses native `EventSource` (auto-reconnects on drop)
- On reconnect, server sends a fresh `snapshot` event with current run state
- Server sends `: heartbeat` comment every 30s to detect stale connections
- No `Last-Event-ID` replay — snapshot-on-connect is sufficient for step-level granularity

**Acceptance criteria:**
- Workflow detail page updates in real time as steps complete
- Clicking a step shows iterations, duration, token usage, tool calls
- Clicking an artifact shows rendered markdown content
- Existing trigger and list functionality still works
- SSE reconnects cleanly after network interruption

### Phase 2: Workflow Definition Viewer (flow diagram)

**Goal:** Visual flow diagram for workflow definitions using DOM-based rendering.

**Layout algorithm:** Topological sort with column assignment. Steps are laid out top-to-bottom. Sequential steps occupy consecutive rows. Parallel branches (future) get adjacent columns. This is a simple algorithm (<100 LOC) that handles our current linear workflows and can be extended for DAGs.

**Tasks:**
1. Add `POST /api/definitions/list` and `POST /api/definitions/get` endpoints
2. Create layout algorithm (topological sort -> row/column assignment)
3. Create `StepNode` component (styled `<div>` with type-based icon, status coloring)
4. Create `EdgeLine` component (SVG `<line>` with arrowhead, CSS animation for active)
5. Create `WorkflowDiagram` composite component (CSS Grid container + SVG overlay)
6. Create `/definitions` list page and `/definitions/:name` diagram page
7. Add step selection -> `Sheet` side panel with agent details, prompt, tools

**Workflow definition discovery:** Definitions are runtime-registered objects. The orchestrator registers workflows at startup via `orchestrator.workflow()`. The `/api/definitions/list` endpoint reads from the orchestrator's in-memory registry. This is dev-orchestrator-specific (not a generic capability).

**Acceptance criteria:**
- `POST /api/definitions/list` returns all registered workflow definitions
- `/definitions/feature` renders a visual flow diagram with 9 connected nodes
- Agent steps and approval steps have distinct visual styles
- Clicking a node opens a `Sheet` side panel with full agent configuration
- Diagram renders smoothly for 5-20 step workflows

### Phase 3: Agent Inspector & Prompt Editor

**Goal:** Read and edit agent system prompts and step configurations from the UI. Accessible from workflow detail (Phase 1) and flow diagram (Phase 2) — does **not** depend on Phase 2.

**Prompt editor approach:** `<textarea>` with live markdown preview side-by-side. No rich-text editor dependency. Template variables (`{{issueNumber}}`, `{{repo}}`) are syntax-highlighted via regex replacement in the preview.

**Tasks:**
1. Create `PromptInspector` component (read-only markdown viewer with variable highlighting)
2. Create `PromptEditor` component (textarea + live preview, extends PromptInspector)
3. Create `StepConfigPanel` component (agent selector, tool list, loop config)
4. Add agent detail page at `/agents/:name` and list page at `/agents`
5. Wire prompt edits to in-memory state (not persisted to disk in v1)

**Acceptance criteria:**
- Agent detail page shows full system prompt, tools, and config
- Editing a system prompt updates the in-memory agent definition
- Changes are reflected when triggering a new workflow run
- Step config panel shows all configurable properties

### Phase 4a: Error Handling & Run Management

**Goal:** Robust error handling for failed steps and workflow lifecycle management.

**Tasks:**
1. Add error detail display for failed steps (error message, stack trace, last tool call)
2. Add cancel/retry workflow actions
3. Add run status filters (running, completed, failed) to dashboard
4. Add run history with pagination (20 per page, in-memory)

**Acceptance criteria:**
- Failed workflows show clear error messages with the failing step highlighted
- Users can retry a failed workflow
- Dashboard filters work correctly and update in real time
- Pagination handles 50+ workflow runs (renders 20 per page, no jank)

### Phase 4b: UX Polish

**Goal:** Navigation and interaction improvements.

**Tasks:**
1. Add breadcrumb navigation across all pages
2. Add keyboard shortcuts (Cmd+K command palette for navigation)
3. Responsive sidebar with collapse toggle
4. Empty states with guidance (no workflows, no definitions, etc.)

**Acceptance criteria:**
- Navigation between pages is fast and intuitive
- Cmd+K opens a command palette for quick navigation
- Empty states guide the user to take action

### Phase 5: Live Diagram Overlay (stretch)

**Goal:** Overlay live run status on the flow diagram.

**Tasks:**
1. Add `activeRun` prop to `WorkflowDiagram`
2. Animate active step node (CSS pulse/glow)
3. Animate edge transitions (CSS flowing animation on active edge)
4. Show iteration counter on active node
5. Show artifact badges on completed nodes

**Acceptance criteria:**
- Opening a workflow definition while a run is active shows live progress on the diagram
- Completed steps turn green, active step pulses, pending steps are gray
- Clicking a node during a live run shows the latest step detail

---

## 9. Dependencies Between Phases

```
Phase 0 (progress events) -> Phase 1 (monitoring) -> Phase 4a (error/run mgmt)
                                                   -> Phase 4b (UX polish)
                              Phase 2 (flow diagram) -> Phase 5 (live overlay)
                              Phase 3 (editor) -- depends on Phase 1 only
```

Phase 0 is a prerequisite for Phase 1. Phases 1, 2, and 3 can be developed in parallel after Phase 0. Phase 4a/4b can start after Phase 1. Phase 5 depends on both Phase 1 and Phase 2.

---

## 10. In-Memory Store Lifecycle

The workflow store is in-memory (no database in v1):

- **Retention:** Maximum 100 workflow runs. When the limit is reached, the oldest completed run is evicted (FIFO). Running workflows are never evicted.
- **Server restart:** All workflow history is lost. This is acceptable for an internal dev tool. A "No run history — start a new workflow" empty state handles this gracefully.
- **Concurrent access:** Bun is single-threaded. The store is a plain `Map`. SSE reads and executor writes interleave via microtasks but never race (no parallel writes). The SSE stream reads a snapshot on connect and receives events via an `EventEmitter` — no shared mutable iteration.

---

## 11. Testing Strategy for SSE

SSE endpoints are tested using an async iterable helper:

```typescript
async function* consumeSSE(url: string): AsyncIterable<StepProgressEvent> {
  const response = await fetch(url);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop()!;
    for (const event of lines) {
      const data = event.replace(/^data: /, '');
      if (data) yield JSON.parse(data);
    }
  }
}
```

Tests verify: events arrive incrementally (not batched), snapshot-on-connect sends current state, heartbeats arrive within timeout, reconnection produces a fresh snapshot.

---

## 12. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| UI Framework | `@vertz/ui` | Signals, JSX, components |
| Components | `@vertz/ui/components` | Card, Table, Badge, Tabs, Sheet, etc. |
| Theme | `@vertz/theme-shadcn` (zinc) | CSS variables, existing setup |
| Flow Diagram | DOM (`<div>` + SVG) | Vertz JSX components, CSS Grid layout |
| Routing | `@vertz/ui/router` | Existing router with lazy loading |
| Data Fetching | `@vertz/ui/query` | Typed queries, SSE integration |
| Backend | `@vertz/server` | Service-based API |
| Validation | `@vertz/schema` | Input/output validation, SSE payload validation |
| Runtime | Bun (`Bun.serve()`) | Current dev-orchestrator runtime |
| Markdown | `marked` | Lightweight, fast, no dependencies |

---

## 13. Review Findings Resolution

### Addressed

| Review | Finding | Resolution |
|--------|---------|------------|
| Technical BLOCKER-1 | StepProgressEvent source unscoped | Added Phase 0: workflow executor modification |
| Technical BLOCKER-2 | SSE runtime ambiguity | Clarified: runs on Bun, not VTZ. SSE works natively. |
| DX SF-1 | GET/POST inconsistency | Standardized all endpoints to POST except SSE stream (GET) |
| DX SF-2 | StepDetail name collision | Renamed to `StepRunDetail` |
| DX SF-3 | Event type vs status confusion | Split into `type` field with explicit mapping to `StepCard.status` |
| DX SF-4 | Artifact type enum too narrow | Added `\| (string & {})` for extensibility |
| DX SF-5 | Canvas premature | Switched to DOM-based diagram |
| DX SF-6 | SSE reconnection unspecified | Added reconnection strategy in Phase 1 |
| Product SF-1 | Canvas scope risk | Same as DX SF-5 — DOM-based |
| Product SF-2 | SSE hiding as unknown | Same as BLOCKER-2 — resolved |
| Product SF-3 | Phase 3 depends on Phase 2 | Decoupled: Phase 3 depends on Phase 1 only |
| Product SF-4 | Phase 4 too broad | Split into Phase 4a (error/run mgmt) and Phase 4b (UX polish) |
| Technical SF-1 | ui-canvas dependency | Removed — DOM-based |
| Technical SF-2 | Auto-layout unspecified | Added: topological sort + column assignment |
| Technical SF-3 | Store lifecycle | Added Section 10: retention, restart, concurrency |
| Technical SF-4 | Type flow map | Added explicit monomorphic note + SSE validation strategy |
| Technical SF-5 | Markdown TBD | Chose `marked` for rendering, textarea+preview for editing |
| DX N-1 | PromptEditor naming | `PromptInspector` (read-only) + `PromptEditor` (Phase 3) |
| DX N-2 | Missing artifact id | Added `id` field to `WorkflowArtifact` |
| DX N-3 | toolInput/output as strings | Changed to `unknown` |
| DX N-4 | Type flow map prose | Added monomorphic note |
| Product N-5 | Definition discovery | Added: runtime-registered, dev-orchestrator-specific |
| Product N-6 | "50+ runs" vague | Clarified: 20 per page, 100 max in store |
| Technical N-1 | POST/GET inconsistency | Same as DX SF-1 |
| Technical N-2 | SSE reconnection | Same as DX SF-6 |
| Technical N-3 | SSE testing strategy | Added Section 11 |
