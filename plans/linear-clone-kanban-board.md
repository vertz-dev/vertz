# Linear Clone — Kanban Board View

**Issue:** #1283
**Status:** Design Discussion — Rev 3
**Date:** 2026-03-14
**Parent:** `plans/linear-clone.md` Phase 3

---

## 1. API Surface

### 1.1 Shared Status/Priority Config

Extract status and priority configuration to a shared module to avoid duplication between `IssueRow`, `IssueCard`, `StatusFilter`, and `StatusSelect`.

```typescript
// src/lib/issue-config.ts
import type { IssuePriority, IssueStatus } from './types';

export const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'bg:muted text:muted-foreground',
  todo: 'bg:secondary text:foreground',
  in_progress: 'bg:accent text:accent-foreground',
  done: 'bg:primary text:primary-foreground',
  cancelled: 'bg:muted text:muted-foreground',
};

export const PRIORITY_CONFIG: Record<IssuePriority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: '#ef4444' },
  high: { label: 'High', color: '#f97316' },
  medium: { label: 'Medium', color: '#eab308' },
  low: { label: 'Low', color: '#3b82f6' },
  none: { label: '', color: '' },
};
```

### 1.2 New Components

```typescript
// src/pages/project-board-page.tsx
import { STATUSES } from '../lib/issue-config';

export function ProjectBoardPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(issueApi.list(projectId));
  const project = query(projectApi.get(projectId));

  let showCreateDialog = false;

  // Group issues by status — declarative single-expression for compiler reactivity.
  // collectDeps() walks into the .map() callback body and finds issues.data,
  // so the compiler correctly classifies `columns` as computed.
  const columns: { status: IssueStatus; label: string; items: Issue[] }[] = STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    items: issues.data?.items.filter((i) => i.status === s.value) ?? [],
  }));

  return (
    <div class={styles.container}>
      <header class={styles.header}>
        <h2 class={styles.title}>Board</h2>
        <button onClick={() => { showCreateDialog = true; }}>New Issue</button>
      </header>

      {issues.loading && <div class={styles.loading}>Loading issues...</div>}
      {issues.error && <div class={styles.error}>Failed to load issues.</div>}

      {!issues.loading && !issues.error && (
        <div class={styles.board}>
          {columns.map((col) => (
            <StatusColumn
              key={col.status}
              status={col.status}
              label={col.label}
              issues={col.items}
              projectKey={project.data?.key}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {showCreateDialog && (
        <CreateIssueDialog
          projectId={projectId}
          onClose={() => { showCreateDialog = false; }}
          onSuccess={() => { showCreateDialog = false; issues.refetch(); }}
        />
      )}
    </div>
  );
}
```

```typescript
// src/components/status-column.tsx
interface StatusColumnProps {
  status: IssueStatus;
  label: string;
  issues: Issue[];
  projectKey?: string;
  projectId: string;
}

export function StatusColumn({ status, label, issues, projectKey, projectId }: StatusColumnProps) {
  return (
    <div class={styles.column}>
      <div class={styles.columnHeader}>
        <span class={styles.columnTitle}>{label}</span>
        <span class={styles.columnCount}>{issues.length}</span>
      </div>
      <div class={styles.columnBody}>
        {issues.length === 0 && <div class={styles.empty}>No issues</div>}
        {issues.map((issue) => (
          <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
            <IssueCard issue={issue} projectKey={projectKey} />
          </Link>
        ))}
      </div>
    </div>
  );
}
```

```typescript
// src/components/issue-card.tsx
import { PRIORITY_CONFIG } from '../lib/issue-config';

interface IssueCardProps {
  issue: Issue;
  projectKey?: string;
}

export function IssueCard({ issue, projectKey }: IssueCardProps) {
  const identifier = projectKey ? `${projectKey}-${issue.number}` : `#${issue.number}`;

  return (
    <div class={styles.card}>
      <span class={styles.identifier}>{identifier}</span>
      <span class={styles.title}>{issue.title}</span>
      <div class={styles.meta}>
        {issue.priority !== 'none' && PRIORITY_CONFIG[issue.priority] && (
          <span class={styles.priority} style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}>
            {PRIORITY_CONFIG[issue.priority].label}
          </span>
        )}
      </div>
    </div>
  );
}
```

### 1.3 View Toggle in ProjectLayout

Uses `Link`'s built-in `activeClass` prop for active tab highlighting — no manual path matching needed. `Link` accepts `className` (not `class`) for its static class name.

```typescript
// src/components/view-toggle.tsx
interface ViewToggleProps {
  projectId: string;
}

export function ViewToggle({ projectId }: ViewToggleProps) {
  return (
    <div class={styles.container}>
      <Link
        href={`/projects/${projectId}`}
        className={styles.tab}
        activeClass={styles.activeTab}
      >
        List
      </Link>
      <Link
        href={`/projects/${projectId}/board`}
        className={styles.tab}
        activeClass={styles.activeTab}
      >
        Board
      </Link>
    </div>
  );
}
```

```typescript
// Updated project-layout.tsx — add view toggle
export function ProjectLayout() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const project = query(projectApi.get(projectId));

  return (
    <div>
      <header class={styles.header}>
        <Link href="/projects" className={styles.breadcrumb}>Projects</Link>
        <span class={styles.separator}>/</span>
        <h1 class={styles.title}>{project.data?.name ?? 'Loading...'}</h1>
      </header>
      <ViewToggle projectId={projectId} />
      {Outlet()}
    </div>
  );
}
```

### 1.4 Route Changes

```typescript
// Updated router.tsx — add /board route, use JSX syntax for all components
'/projects/:projectId': {
  component: () => <ProjectLayout />,
  children: {
    '/': {
      component: () => <IssueListPage />,
    },
    '/board': {
      component: () => <ProjectBoardPage />,
    },
    '/issues/:issueId': {
      component: () => <IssueDetailPage />,
    },
  },
},
```

**Note:** The existing router uses function call syntax (`ProjectLayout()`, `IssueListPage()`) instead of JSX. This PR will fix those to use JSX syntax (`<ProjectLayout />`, `<IssueListPage />`) per `ui-components.md` rules.

### 1.5 No Backend Changes

All data already available via `issueApi.list(projectId)`. Grouping by status is done client-side.

---

## 2. Manifesto Alignment

### Explicit over implicit
- Column grouping is explicit: `STATUSES.map(s => issues.filter(i => i.status === s.value))`
- No magic column detection from data

### Convention over configuration
- Same `query()` / `css()` / `Link` patterns as existing pages
- Same `CreateIssueDialog` reused from list view

### Compile-time over runtime
- Typed route params: `useParams<'/projects/:projectId'>()`
- Typed issue status: `IssueStatus` union prevents invalid column creation

### Tradeoffs
- **Client-side grouping over per-status queries**: One `issueApi.list(projectId)` call, grouped client-side. Simpler than 5 separate queries per column. At Linear clone scale (~20 issues per project), this is fine. The parent design doc's Phase 3 suggested per-status queries, but a single query is simpler and avoids 5x network requests.

### Deviations from Parent Phase 3

The parent design doc (`plans/linear-clone.md` Phase 3) includes scope that is deliberately deferred here:

- **No `ListTransition`** — animated list changes deferred to #1286 (polish)
- **No `Avatar` / `StatusBadge` / `PriorityIcon` components** — reusing inline priority styling from `IssueRow`. Separate components deferred to polish phase.
- **No assignee avatars on cards** — requires deep normalization wiring for resolved relations. Deferred until entity store supports this.
- **Single query instead of per-column queries** — simpler for this data scale.

These are conscious scope reductions to deliver the board structure first and layer visual polish later.

---

## 3. Non-Goals

- **No drag-and-drop** — status changes via issue detail page only (design doc explicit non-goal)
- **No inline status editing on cards** — deferred to #1284 (issue mutations)
- **No virtual scrolling** — seed data is small enough that all cards render
- **No column collapsing** — all columns always visible
- **No assignee avatars on cards** — deferred to when deep normalization is wired up
- **No `ListTransition` animations** — deferred to #1286 (polish)

---

## 4. Unknowns

None identified. This is straightforward UI work using existing patterns and data.

---

## 5. POC Results

N/A — no unknowns requiring POC.

---

## 6. Type Flow Map

```
issueApi.list(projectId) → QueryDescriptor<ListResponse<Issue>>
  → query() → QueryResult<ListResponse<Issue>>
    → .data.items: Issue[] (with typed status: IssueStatus)
      → STATUSES.map() groups by status
        → StatusColumn receives Issue[] per status
          → IssueCard receives single Issue
            → issue.priority: IssuePriority → PRIORITY_CONFIG lookup
            → issue.number + projectKey for identifier

Link(activeClass) → built-in currentPath signal comparison
  → ViewToggle: Link href matches current path → activeClass applied reactively
```

No new generics introduced. All types flow through existing `Issue` and `IssueStatus`.

---

## 7. E2E Acceptance Test

```typescript
describe('Feature: Kanban board view', () => {
  describe('Given a project with issues across multiple statuses', () => {
    describe('When navigating to the board view', () => {
      it('Then displays columns for each status', () => {
        // Navigate to /projects/:id/board
        // Expect columns: Backlog, Todo, In Progress, Done, Cancelled
      });

      it('Then each column shows the correct issue count', () => {
        // Column header shows count matching filtered issues
      });

      it('Then issue cards show identifier, title, and priority', () => {
        // Card displays "ENG-1", title text, priority indicator
      });
    });
  });

  describe('Given the board view is loading', () => {
    describe('When the page renders', () => {
      it('Then shows a loading indicator', () => {
        // Loading state visible before data resolves
      });
    });
  });

  describe('Given a project with zero issues', () => {
    describe('When viewing the board', () => {
      it('Then all columns show "No issues" placeholder', () => {
        // Each column displays empty state
      });
    });
  });

  describe('Given the board view is displayed', () => {
    describe('When clicking an issue card', () => {
      it('Then navigates to the issue detail page', () => {
        // Click card → URL changes to /projects/:id/issues/:issueId
      });
    });
  });

  describe('Given the project layout', () => {
    describe('When toggling between list and board views', () => {
      it('Then the view toggle highlights the active view', () => {
        // Click "Board" tab → board renders, tab highlighted
        // Click "List" tab → list renders, tab highlighted
      });

      it('Then the URL reflects the active view', () => {
        // /projects/:id → list view
        // /projects/:id/board → board view
      });
    });
  });

  describe('Given the board view with a New Issue button', () => {
    describe('When creating a new issue', () => {
      it('Then the issue appears in the correct status column after refetch', () => {
        // Click "New Issue", fill form, submit
        // Issue appears in the matching status column
      });
    });
  });
});
```

---

## 8. Implementation Plan

### Single Phase

This is a UI-only change with no backend modifications. One phase is sufficient.

**Work:**
1. Extract shared status/priority config to `src/lib/issue-config.ts`
2. Create `IssueCard` component (uses shared config)
3. Create `StatusColumn` component
4. Create `ProjectBoardPage` page with loading/error states
5. Create `ViewToggle` component (uses `router.current?.route.pattern`)
6. Update `ProjectLayout` to include `ViewToggle`
7. Add `/board` route to router, fix existing routes to use JSX syntax
8. Update `IssueRow` and `StatusFilter` to import from shared config
9. Style board with horizontal scroll layout

**Files changed:**
- `src/lib/issue-config.ts` (new — shared status/priority constants)
- `src/components/issue-card.tsx` (new)
- `src/components/status-column.tsx` (new)
- `src/components/view-toggle.tsx` (new)
- `src/pages/project-board-page.tsx` (new)
- `src/components/project-layout.tsx` (modified — add ViewToggle)
- `src/components/issue-row.tsx` (modified — import from shared config)
- `src/components/status-filter.tsx` (modified — import from shared config)
- `src/components/status-select.tsx` (modified — import from shared config)
- `src/router.tsx` (modified — add /board route, fix JSX syntax)

**Files NOT changed:**
- No backend files
- No type changes
- No client SDK changes

---

## 9. Review Resolution Log

### Rev 2 (2026-03-14) — Addresses Product + Technical reviews

| Finding | Source | Resolution |
|---------|--------|------------|
| BLOCKER: `currentPath` doesn't exist on Router | Technical | Fixed: use `router.current?.route.pattern === '/board'` |
| Parent doc deviations not acknowledged | Product | Added "Deviations from Parent Phase 3" section |
| Missing loading/error/empty states | Product + Technical | Added to `ProjectBoardPage` and acceptance criteria |
| `STATUSES` constant undefined | Product + Technical | Added `src/lib/issue-config.ts` with shared config |
| Route JSX vs function call inconsistency | Technical | Added note: this PR fixes existing calls to JSX syntax |
| Extract shared status/priority config | Product | Added `issue-config.ts` to implementation plan |
| Compiler reactivity note for columns | Technical | Added comment in code explaining `collectDeps` behavior |
| `Outlet()` function call pattern | Technical | Kept as-is — framework utility function, not a user component |

### Rev 3 (2026-03-14) — Addresses DX review

| Finding | Source | Resolution |
|---------|--------|------------|
| Use `Link`'s `activeClass` prop instead of manual path matching | DX | Adopted: `ViewToggle` now uses `activeClass` — no router API needed |
| `className` vs `class` inconsistency on Link | DX | Fixed: `Link` uses `className`, noted in doc. Other elements use `class` |
| `priorityConfig` duplication | DX | Already addressed in Rev 2 (shared `issue-config.ts`) |
| "New Issue" button missing styling | DX | Will add `styles.newBtn` during implementation |
