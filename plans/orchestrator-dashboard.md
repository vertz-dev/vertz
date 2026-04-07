# Orchestrator Dashboard — Design Doc

## Overview

A full-featured dashboard for the dev-orchestrator that lets users monitor running workflows in real time, inspect artifacts, view workflow definitions as interactive flow diagrams, edit workflow configurations, and trigger new runs. Built entirely with Vertz (UI + server + VTZ runtime).

---

## 1. API Surface

### 1.1 Backend — New API Endpoints

```typescript
// --- Workflow Runs (extend existing service) ---

// Stream step-by-step progress via SSE
// GET /api/workflows/:id/stream
// Returns: Server-Sent Events with StepProgressEvent payloads
interface StepProgressEvent {
  readonly step: string;
  readonly status: 'started' | 'iteration' | 'tool-call' | 'completed' | 'failed';
  readonly iteration?: number;
  readonly totalIterations?: number;
  readonly toolName?: string;
  readonly toolInput?: string;
  readonly response?: string;
  readonly timestamp: number;
}

// Get artifacts produced by a workflow run
// POST /api/workflows/artifacts
interface WorkflowArtifactsInput {
  readonly runId: string;
}
interface WorkflowArtifact {
  readonly path: string;
  readonly type: 'design-doc' | 'review' | 'implementation-summary' | 'code';
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
interface StepDetail {
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
  readonly input: string;
  readonly output: string;
  readonly duration: number;
}

// --- Workflow Definitions (new service) ---

// List all registered workflow definitions
// GET /api/definitions
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
  readonly steps: readonly StepDetail[];
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
/                           → Dashboard (workflow runs overview)
/workflows/:id              → Workflow Run Detail (live monitoring)
/workflows/:id/steps/:step  → Step Inspector (tool calls, artifacts)
/definitions                 → Workflow Definitions list
/definitions/:name           → Flow Diagram view + definition editor
/definitions/:name/steps/:step → Step definition editor
/agents                      → Agent Registry
/agents/:name                → Agent Detail (prompt, tools, config)
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

// --- Flow Diagram ---

// WorkflowDiagram: canvas-based flow visualization
<WorkflowDiagram
  definition={workflowDef}
  activeRun={currentRun}       // optional — highlights active step
  onStepSelect={(step) => ...}
  editable={false}
/>

// StepNode: a single node in the flow diagram
// (rendered on canvas via @vertz/ui-canvas)
interface StepNodeProps {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly status?: 'pending' | 'active' | 'completed' | 'failed';
  readonly position: { x: number; y: number };
  readonly selected: boolean;
}

// EdgeLine: connection between two step nodes
interface EdgeLineProps {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly animated: boolean;    // pulse animation for active transitions
}

// --- Definition Editor ---

// PromptEditor: markdown-aware text editor for agent system prompts
<PromptEditor
  value={systemPrompt}
  onChange={(v) => ...}
  variables={['issueNumber', 'repo']}  // highlights template vars
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
| **If it builds, it works** | All API contracts are typed end-to-end. Workflow definitions, step configs, and artifacts flow through `@vertz/schema` validation. The UI uses typed queries — no raw fetch calls. |
| **One way to do things** | Single dashboard for all orchestrator operations. No separate CLI workflow, no external tools. The flow diagram IS the workflow definition — visual and code are the same artifact. |
| **AI agents are first-class users** | The dashboard is designed to be inspectable by agents. The step detail API exposes every tool call and iteration, making agent behavior auditable. Future: agents could use this dashboard via MCP to self-monitor. |
| **Performance is not optional** | SSE streaming for live updates (no 3-5s polling). Canvas-based flow diagram via PixiJS for smooth rendering of large workflows. Lazy loading for artifact content. |
| **No ceilings** | Built on `@vertz/ui-canvas` for the flow diagram — no external dependency like React Flow. Custom-built for our exact needs, with Vertz signal reactivity. |

### Tradeoffs

- **Canvas diagram vs DOM-based** — Canvas (PixiJS) gives better performance for complex flows with many nodes/edges but is harder to style with CSS. We accept this tradeoff because workflow diagrams can grow large, and the canvas phase 2 JSX model gives us a declarative API on top.
- **SSE vs WebSocket** — SSE is simpler (HTTP-based, auto-reconnect, one-directional) and sufficient since the dashboard only reads live data. WebSocket would add complexity for bidirectional capability we don't need yet.
- **Definition editing in UI vs code** — The visual editor generates workflow definition code (TypeScript). For v1, editing is read-only inspection with prompt editing. Full visual workflow building is Phase 3+.

### What Was Rejected

- **External diagram library (React Flow, XYFlow)** — Not Vertz-native. Would require React compatibility layer and break our component model. We build on `@vertz/ui-canvas` instead.
- **GraphQL for the API** — Over-engineered for this use case. REST + SSE is simpler and aligns with the existing `@vertz/server` service pattern.
- **Separate "orchestrator" package** — The dashboard is part of `sites/dev-orchestrator`, not a reusable package. It's an internal tool, not a public API.

---

## 3. Non-Goals

- **Multi-tenant orchestrator** — This is a single-user/team developer tool. No auth, no tenant isolation. Role-based access is deferred to a future phase.
- **Visual workflow builder (drag-and-drop creation)** — Phase 1 is read-only visualization + prompt editing. Full drag-and-drop workflow creation is a future milestone.
- **Persistent workflow history** — The current in-memory store is sufficient for v1. Database-backed persistence is a separate concern.
- **Mobile-responsive layout** — This is a desktop developer tool. No mobile breakpoints.
- **Diff view for workflow changes** — No version control for workflow definitions in v1.
- **Custom theme for the dashboard** — Uses the standard Vertz zinc theme. No custom branding.

---

## 4. Unknowns

### Resolved

- **Canvas phase 2 readiness** — The `@vertz/ui-canvas` package has Phase 1 (imperative bindings) complete. Phase 2 (declarative JSX) is in design. **Resolution:** Start with imperative canvas API for the flow diagram. Migrate to JSX when Phase 2 ships. The node/edge rendering logic stays the same.

### Open

- **SSE through VTZ runtime** — The VTZ runtime (Rust + V8) serves HTTP. Does it support SSE (chunked transfer-encoding with `text/event-stream`)? If not, we need a polling fallback or a WebSocket alternative.
  - **Resolution path:** POC in Phase 1 — test SSE from a Vertz server action. If blocked, use WebSocket or fall back to 1s polling.

- **Agent step progress granularity** — The current `run()` function returns a single result after all iterations complete. To stream per-iteration progress, we'd need to hook into the ReAct loop.
  - **Resolution path:** Phase 1 uses step-level granularity (step started/completed). Phase 2 adds iteration-level streaming by adding an `onProgress` callback to the loop.

- **Canvas text rendering for prompts** — PixiJS text rendering has limited rich-text support. Node labels are fine, but we may need DOM overlays for prompt previews in the diagram.
  - **Resolution path:** Use hybrid DOM/Canvas. Nodes are canvas-rendered; detail panels and editors are DOM-rendered in a `Sheet` or side panel.

---

## 5. POC Results

No POC has been conducted yet. The following POCs are recommended before Phase 2 (flow diagram):

1. **SSE streaming from Vertz server** — Can a `@vertz/server` action stream SSE events?
2. **Canvas node rendering** — Render 20+ nodes with edges using `@vertz/ui-canvas` imperative API. Measure rendering performance and interaction latency.

---

## 6. Type Flow Map

```
WorkflowDefinition (from @vertz/agents)
  → WorkflowDefinitionSummary (API response)
    → WorkflowDiagram props (frontend component)
      → StepNode[] + EdgeLine[] (canvas rendering)

WorkflowRun (from workflow-store)
  → StepProgressEvent (SSE stream)
    → WorkflowTimeline props
      → StepCard props (per-step UI)

StepDetail (API response)
  → ToolCallRecord[] (detailed iteration data)
    → ToolCallLog props (expandable log UI)

WorkflowArtifact (API response)
  → ArtifactViewer props
    → Rendered markdown (display)

AgentDetail (API response)
  → AgentDetail page props
    → PromptEditor props (for system prompt editing)
```

No dead generics — each type flows from backend definition to frontend rendering.

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
      it('Then a canvas renders 9 step nodes in sequential order', () => {});
      it('Then edges connect each step to the next', () => {});
      it('Then agent steps show the agent name inside the node', () => {});
      it('Then the approval step has a distinct visual style (diamond/gate)', () => {});
    });

    describe('When the user clicks a step node', () => {
      it('Then a side panel opens with the step configuration', () => {});
      it('Then the agent system prompt is displayed in the panel', () => {});
      it('Then the tools available to the agent are listed', () => {});
    });

    // @ts-expect-error — editing not available in read-only mode
    describe('When the user tries to drag a node in read-only mode', () => {
      it('Then the node does not move', () => {});
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
    it('Then the system prompt is shown in a scrollable editor', () => {});
    it('Then the available tools are listed with their input/output schemas', () => {});
    it('Then loop config (maxIterations, tokenBudget) is displayed', () => {});
  });
});
```

---

## 8. Implementation Plan

### Phase 1: Live Monitoring Upgrade (foundation)

**Goal:** Replace polling with streaming, add step detail inspection and artifact viewing.

**Tasks:**
1. Add `StepProgressEvent` emission to the workflow executor (emit events on step start/complete)
2. Add `/api/workflows/:id/stream` SSE endpoint (or polling fallback)
3. Add `/api/workflows/artifacts` and `/api/workflows/step-detail` endpoints
4. Upgrade `workflow-detail.tsx` — replace 3s polling with SSE, add step click → detail panel
5. Create `ArtifactViewer` component (markdown rendering)
6. Create `ToolCallLog` component (expandable tool call list)
7. Create `StepCard` component (extracted from current inline step rendering)

**Acceptance criteria:**
- Workflow detail page updates in real time as steps complete
- Clicking a step shows iterations, duration, token usage, tool calls
- Clicking an artifact shows rendered markdown content
- Existing trigger and list functionality still works

### Phase 2: Workflow Definition Viewer (flow diagram)

**Goal:** Visual flow diagram for workflow definitions using `@vertz/ui-canvas`.

**Tasks:**
1. Add `/api/definitions` and `/api/definitions/get` endpoints
2. Create auto-layout algorithm for sequential step positioning
3. Create `StepNode` canvas component (rectangle with label, icon by type)
4. Create `EdgeLine` canvas component (connection lines with arrows)
5. Create `WorkflowDiagram` composite component (canvas + nodes + edges)
6. Create `/definitions` list page and `/definitions/:name` diagram page
7. Add step selection → side panel with agent details, prompt, tools

**Acceptance criteria:**
- `/definitions` lists all registered workflow definitions
- `/definitions/feature` renders a visual flow diagram with 9 connected nodes
- Agent steps and approval steps have distinct visual styles
- Clicking a node opens a side panel with full agent configuration
- Diagram renders smoothly with no jank

### Phase 3: Definition Inspector & Prompt Editor

**Goal:** Read and edit agent system prompts and step configurations from the UI.

**Tasks:**
1. Create `PromptEditor` component (syntax-highlighted markdown editor)
2. Create `StepConfigPanel` component (agent selector, tool list, loop config)
3. Add agent detail page at `/agents/:name`
4. Add routes `/definitions/:name/steps/:step` for step-level editing
5. Wire prompt edits to in-memory state (not persisted to disk in v1)

**Acceptance criteria:**
- Agent detail page shows full system prompt, tools, and config
- Editing a system prompt updates the in-memory agent definition
- Changes are reflected when triggering a new workflow run
- Step config panel shows all configurable properties

### Phase 4: Dashboard Polish & UX

**Goal:** Production-quality dashboard UX with proper empty states, error handling, and navigation.

**Tasks:**
1. Add run status filters (running, completed, failed) to dashboard
2. Add run history with pagination
3. Add error detail display for failed steps
4. Add cancel/retry workflow actions
5. Add keyboard shortcuts (Cmd+K command palette for navigation)
6. Add breadcrumb navigation across all pages
7. Responsive sidebar with collapse toggle

**Acceptance criteria:**
- Dashboard handles 50+ workflow runs without performance issues
- Failed workflows show clear error messages and allow retry
- Navigation between pages is fast and intuitive
- Empty states guide the user to take action

### Phase 5: Live Diagram Overlay (stretch)

**Goal:** Overlay live run status on the flow diagram.

**Tasks:**
1. Add `activeRun` prop to `WorkflowDiagram`
2. Animate active step node (pulse/glow)
3. Animate edge transitions (flowing dots on active edge)
4. Show iteration counter on active node
5. Show artifact badges on completed nodes

**Acceptance criteria:**
- Opening a workflow definition while a run is active shows live progress on the diagram
- Completed steps turn green, active step pulses, pending steps are gray
- Clicking a node during a live run shows the latest step detail

---

## 9. Dependencies Between Phases

```
Phase 1 (monitoring) ─────┬──→ Phase 4 (polish)
                           │
Phase 2 (flow diagram) ───┤
                           │
Phase 3 (editor) ─────────┘──→ Phase 5 (live overlay)
```

Phases 1 and 2 can be developed in parallel. Phase 3 depends on Phase 2 (needs the diagram UI). Phase 4 can start after Phase 1. Phase 5 depends on both Phase 2 and Phase 1.

---

## 10. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| UI Framework | `@vertz/ui` | Signals, JSX, components |
| Components | `@vertz/ui/components` | Card, Table, Badge, Tabs, Sheet, etc. |
| Theme | `@vertz/theme-shadcn` (zinc) | CSS variables, existing setup |
| Flow Diagram | `@vertz/ui-canvas` (PixiJS) | Imperative API → migrate to JSX Phase 2 |
| Routing | `@vertz/ui/router` | Existing router with lazy loading |
| Data Fetching | `@vertz/ui/query` | Typed queries, SSE integration |
| Backend | `@vertz/server` | Service-based API |
| Validation | `@vertz/schema` | Input/output validation |
| Runtime | VTZ | Dev server, HMR, SSR |
| Markdown | Custom or lightweight lib | For artifact rendering |
