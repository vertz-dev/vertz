# Phase 5: Live Diagram Overlay (Stretch)

## Context

Overlay live workflow run status on the flow diagram. When viewing a workflow definition while a run is active, the diagram shows which step is running, which are complete, and which are pending — with animations.

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 1 + Phase 2

---

## Task 1: Connect live run data to the diagram

**Files:** (3)
- `sites/dev-orchestrator/src/ui/pages/definition-detail.tsx` (modified)
- `sites/dev-orchestrator/src/ui/components/workflow-diagram.tsx` (modified)
- `sites/dev-orchestrator/src/ui/components/workflow-diagram.test.ts` (modified)

**What to implement:**

When a run is active for a workflow definition:
1. Subscribe to SSE stream for the active run
2. Map step progress events to step statuses
3. Pass `activeRun` prop to `WorkflowDiagram`:

```typescript
interface ActiveRunOverlay {
  readonly currentStep: string;
  readonly stepStatuses: Record<string, 'pending' | 'active' | 'completed' | 'failed'>;
  readonly iterationCounts: Record<string, number>;
}
```

The definition detail page needs to check if any active run matches the current definition. Use the workflow list endpoint with status filter.

**Acceptance criteria:**
- [ ] Opening a definition page while a run is active shows live status
- [ ] Step nodes update color/status as steps complete
- [ ] Active step is highlighted
- [ ] Pending steps remain gray

---

## Task 2: Add step animations and badges

**Files:** (3)
- `sites/dev-orchestrator/src/ui/components/step-node.tsx` (modified)
- `sites/dev-orchestrator/src/ui/components/edge-line.tsx` (modified)
- `sites/dev-orchestrator/src/ui/components/step-node.test.ts` (modified)

**What to implement:**

Enhance StepNode with live overlay:
- Active step: CSS pulse/glow animation on the border
- Completed step: green background with checkmark badge
- Failed step: red background with X badge
- Iteration counter: small badge showing current iteration count on active step
- Artifact badge: small icon on completed steps that produced artifacts

Enhance EdgeLine with live overlay:
- Active edge (between completed and active step): CSS animated dashed stroke
- Completed edges: solid green stroke
- Pending edges: gray dashed stroke

**Acceptance criteria:**
- [ ] Active step pulses with CSS animation
- [ ] Completed steps show green with checkmark
- [ ] Failed steps show red with X
- [ ] Iteration counter badge updates in real time
- [ ] Edge animations flow from completed to active step
- [ ] Clicking an active/completed node opens step detail in side panel
