# Phase 4b: UX Polish

## Context

Navigation improvements, keyboard shortcuts, and empty states. This is ergonomic polish — can be deferred if time is short without losing functionality.

Design doc: `plans/orchestrator-dashboard.md`
Depends on: Phase 1

---

## Task 1: Add breadcrumb navigation

**Files:** (3)
- `sites/dev-orchestrator/src/ui/components/breadcrumbs.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/breadcrumbs.test.ts` (new)
- `sites/dev-orchestrator/src/ui/layouts/dashboard-layout.tsx` (modified)

**What to implement:**

Auto-generated breadcrumbs based on current route:
- `/` -> "Dashboard"
- `/workflows/wf-1` -> "Dashboard > Workflow wf-1"
- `/workflows/wf-1/steps/plan` -> "Dashboard > Workflow wf-1 > Step: plan"
- `/definitions/feature` -> "Dashboard > Definitions > feature"
- `/agents/planner` -> "Dashboard > Agents > planner"

Rendered in the dashboard layout header. Each segment is a clickable link.

**Acceptance criteria:**
- [ ] Breadcrumbs render correctly for all page routes
- [ ] Each breadcrumb segment is clickable and navigates
- [ ] Current page is displayed but not clickable

---

## Task 2: Add command palette (Cmd+K)

**Files:** (3)
- `sites/dev-orchestrator/src/ui/components/command-palette.tsx` (new)
- `sites/dev-orchestrator/src/ui/components/command-palette.test.ts` (new)
- `sites/dev-orchestrator/src/ui/layouts/dashboard-layout.tsx` (modified)

**What to implement:**

A command palette overlay (similar to VS Code's Cmd+K):
- Triggered by Cmd+K (or Ctrl+K)
- Searchable list of navigation targets: pages, recent workflows, agents, definitions
- Keyboard navigation (up/down arrows, Enter to select, Escape to close)
- Uses Dialog component from `@vertz/ui/components`

**Acceptance criteria:**
- [ ] Cmd+K opens the command palette
- [ ] Typing filters the list of navigation targets
- [ ] Arrow keys navigate, Enter selects, Escape closes
- [ ] Navigating to a result closes the palette and routes

---

## Task 3: Add empty states and sidebar

**Files:** (4)
- `sites/dev-orchestrator/src/ui/components/empty-state.tsx` (new)
- `sites/dev-orchestrator/src/ui/layouts/sidebar.tsx` (new)
- `sites/dev-orchestrator/src/ui/layouts/dashboard-layout.tsx` (modified)
- `sites/dev-orchestrator/src/ui/pages/dashboard.tsx` (modified)

**What to implement:**

Empty states for:
- No workflow runs: "No workflows yet. Start one by entering an issue number."
- No definitions: "No workflow definitions registered."
- No agents: "No agents registered."

Sidebar navigation:
- Fixed left sidebar with links: Dashboard, Definitions, Agents
- Collapse toggle (icon-only mode)
- Active page highlighted

**Acceptance criteria:**
- [ ] Empty states show guidance when no data exists
- [ ] Sidebar renders with navigation links
- [ ] Active page is highlighted in sidebar
- [ ] Sidebar collapses to icon-only mode
- [ ] After server restart, empty state is shown (data is lost)
