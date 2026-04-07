# Phase 2: Workflow Definition Viewer (Flow Diagram)

## Context

This phase adds visual flow diagram rendering for workflow definitions. Uses DOM-based rendering (`<div>` nodes + SVG edges) — not canvas. The diagram shows the workflow structure with step nodes, edge connections, and a side panel for inspecting step/agent configuration.

Can be developed in parallel with Phase 1 (no dependency).

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 0 (needs VTZ runtime working)

---

## Task 1: Add workflow definition API endpoints

**Files:** (4)
- `sites/dev-orchestrator/src/api/services/definitions.ts` (new)
- `sites/dev-orchestrator/src/api/services/definitions.test.ts` (new)
- `sites/dev-orchestrator/src/api/server.ts` (modified — register new service)
- `sites/dev-orchestrator/src/orchestrator.ts` (modified — expose workflow definitions)

**What to implement:**

Create a definitions service that reads from the orchestrator's registered workflows:

```typescript
export function createDefinitionsService(orchestrator: Orchestrator) {
  return service('definitions', {
    access: { list: rules.public, get: rules.public },
    actions: {
      list: {
        method: 'POST',
        response: s.object({ definitions: s.array(definitionSummarySchema) }),
        handler() {
          // Read from orchestrator.workflows registry
        },
      },
      get: {
        method: 'POST',
        body: s.object({ name: s.string() }),
        response: definitionDetailSchema.nullable(),
        handler(input) {
          // Return full definition with agent details, prompts, tools
        },
      },
    },
  });
}
```

The orchestrator needs to expose its workflow definitions and agent registry. Add a `definitions()` method or property to the orchestrator object.

**Acceptance criteria:**
- [ ] `POST /api/definitions/list` returns all registered workflow definitions with step summaries
- [ ] `POST /api/definitions/get` returns full definition with agent details (name, description, model, system prompt, tools, loop config)
- [ ] Returns null for unknown definition names
- [ ] Step summaries include: name, agent name, isApproval flag

---

## Task 2: Create layout algorithm and diagram data model

**Files:** (2)
- `sites/dev-orchestrator/src/ui/lib/workflow-layout.ts` (new)
- `sites/dev-orchestrator/src/ui/lib/workflow-layout.test.ts` (new)

**What to implement:**

Topological sort with row/column assignment for sequential workflows:

```typescript
interface LayoutNode {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly row: number;
  readonly col: number;
}

interface LayoutEdge {
  readonly from: string;
  readonly to: string;
}

interface DiagramLayout {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  readonly rows: number;
  readonly cols: number;
}

export function computeLayout(steps: readonly StepSummary[]): DiagramLayout;
```

For v1, workflows are linear (sequential steps). The layout assigns each step to a consecutive row, column 0. Edges connect consecutive steps. This is simple (~30 LOC) but structured so parallel branches can be added later (by assigning different columns).

**Acceptance criteria:**
- [ ] Linear workflow of 9 steps produces 9 nodes in rows 0-8, column 0
- [ ] Edges connect step[i] -> step[i+1] for sequential workflows
- [ ] Approval steps are typed as 'approval', agent steps as 'agent'
- [ ] Layout is deterministic (same input = same output)
- [ ] Empty workflow produces empty layout

---

## Task 3: Create StepNode and EdgeLine components

**Files:** (4)
- `sites/dev-orchestrator/src/ui/components/step-node.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/step-node.test.ts` (new)
- `sites/dev-orchestrator/src/ui/components/edge-line.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/edge-line.test.ts` (new)

**What to implement:**

`StepNode` — styled `<div>` representing a workflow step:
```typescript
interface StepNodeProps {
  readonly name: string;
  readonly type: 'agent' | 'approval';
  readonly agent?: string;
  readonly selected: boolean;
  readonly status?: 'pending' | 'active' | 'completed' | 'failed';
  readonly onClick?: () => void;
}
```
- Agent steps: rounded rectangle with agent name
- Approval steps: diamond/gate shape (rotated square or distinct border style)
- Selected state: highlighted border
- Status coloring (same palette as StepCard from Phase 1)

`EdgeLine` — SVG line connecting two nodes:
```typescript
interface EdgeLineProps {
  readonly fromRow: number;
  readonly toRow: number;
  readonly animated: boolean;
}
```
- Vertical line with arrowhead at the bottom
- CSS animation for active edges (dashed stroke animation)

**Acceptance criteria:**
- [ ] StepNode renders with name and agent label
- [ ] Agent and approval steps have distinct visual styles
- [ ] Selected node has highlighted border
- [ ] EdgeLine renders SVG line between rows with arrowhead
- [ ] Animated prop adds CSS pulse/dash animation

---

## Task 4: Create WorkflowDiagram composite component

**Files:** (2)
- `sites/dev-orchestrator/src/ui/components/workflow-diagram.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/workflow-diagram.test.ts` (new)

**What to implement:**

```typescript
interface WorkflowDiagramProps {
  readonly definition: WorkflowDefinitionDetail;
  readonly activeRun?: { currentStep: string; stepStatuses: Record<string, string> };
  readonly selectedStep?: string;
  readonly onStepSelect?: (step: string) => void;
}
```

- Computes layout using `computeLayout()`
- Renders a CSS Grid container with rows matching layout
- Places `StepNode` components in grid cells
- Overlays SVG `EdgeLine` components between nodes
- Handles step selection (click node -> `onStepSelect`)

**Acceptance criteria:**
- [ ] Renders 9-step workflow as a vertical flow diagram
- [ ] Nodes are positioned correctly in grid
- [ ] Edges connect consecutive steps
- [ ] Clicking a node fires `onStepSelect`
- [ ] Selected step is visually highlighted

---

## Task 5: Create definitions pages and side panel

**Files:** (4)
- `sites/dev-orchestrator/src/ui/pages/definitions-list.tsx` (new)
- `sites/dev-orchestrator/src/ui/pages/definition-detail.tsx` (new)
- `sites/dev-orchestrator/src/ui/pages/definition-detail.test.ts` (new)
- `sites/dev-orchestrator/src/ui/router.ts` (modified — add routes)

**What to implement:**

`/definitions` — list page:
- Fetches definitions via `POST /api/definitions/list`
- Table with name, step count, agent names
- Click to navigate to `/definitions/:name`

`/definitions/:name` — diagram page:
- Fetches definition detail via `POST /api/definitions/get`
- Renders `WorkflowDiagram`
- On step select, opens a `Sheet` side panel with:
  - Step name and type
  - Agent details (name, description, model)
  - System prompt (read-only, scrollable)
  - Tools list
  - Loop config (maxIterations, tokenBudget)

**Acceptance criteria:**
- [ ] `/definitions` lists all registered workflow definitions
- [ ] `/definitions/feature` renders the flow diagram with 9 nodes
- [ ] Clicking a step node opens side panel with agent configuration
- [ ] Side panel shows system prompt, tools, and loop config
- [ ] Side panel closes on clicking outside or pressing Escape
