# Linear Clone — Vertz Feature Showcase

**Issue:** #1042
**Status:** Design Discussion
**Date:** 2026-03-08

A project tracker modeled after Linear, built as the primary Vertz example app. It replaces `entity-todo` as the showcase for the framework's entity-driven architecture, deep normalization, optimistic updates, and cross-entity reactive propagation.

The app starts as a framework demo and is designed to grow into a standalone product — with AI integration, codebase connectivity, and real-time collaboration as future layers.

---

## 1. API Surface

### 1.1 Entity Model (Backend)

Five entities with relations that exercise deep normalization at every level.

```typescript
// src/api/schema.ts
import { d } from '@vertz/db';

// ── Tables ─────────────────────────────────────────────────────────

export const usersTable = d.table('users', {
  id: d.text().primaryKey(),
  name: d.text().notNull(),
  email: d.text().notNull().unique(),
  avatarUrl: d.text(),
  createdAt: d.timestamp().notNull().defaultNow(),
});

export const projectsTable = d.table('projects', {
  id: d.text().primaryKey(),
  name: d.text().notNull(),
  slug: d.text().notNull().unique(),
  description: d.text(),
  color: d.text().notNull().default('#3b82f6'),
  leadId: d.text().references(() => usersTable, 'id'),
  createdAt: d.timestamp().notNull().defaultNow(),
});

export const labelsTable = d.table('labels', {
  id: d.text().primaryKey(),
  name: d.text().notNull(),
  color: d.text().notNull(),
  projectId: d.text().notNull().references(() => projectsTable, 'id'),
});

export const issuesTable = d.table('issues', {
  id: d.text().primaryKey(),
  title: d.text().notNull(),
  description: d.text(),
  status: d.text().notNull().default('backlog'),   // backlog | todo | in_progress | done | cancelled
  priority: d.integer().notNull().default(0),       // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  sortOrder: d.real().notNull().default(0),
  projectId: d.text().notNull().references(() => projectsTable, 'id'),
  assigneeId: d.text().references(() => usersTable, 'id'),
  createdById: d.text().notNull().references(() => usersTable, 'id'),
  createdAt: d.timestamp().notNull().defaultNow(),
  updatedAt: d.timestamp().notNull().defaultNow(),
});

export const issueLabelsTable = d.table('issue_labels', {
  issueId: d.text().notNull().references(() => issuesTable, 'id'),
  labelId: d.text().notNull().references(() => labelsTable, 'id'),
}, (t) => ({
  pk: d.primaryKey(t.issueId, t.labelId),
}));

export const commentsTable = d.table('comments', {
  id: d.text().primaryKey(),
  body: d.text().notNull(),
  issueId: d.text().notNull().references(() => issuesTable, 'id'),
  authorId: d.text().notNull().references(() => usersTable, 'id'),
  createdAt: d.timestamp().notNull().defaultNow(),
});

// ── Models with Relations ──────────────────────────────────────────

export const usersModel = d.model(usersTable);

export const projectsModel = d.model(projectsTable, {
  lead: d.ref.one(() => usersTable, 'leadId'),
});

export const labelsModel = d.model(labelsTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
});

export const issuesModel = d.model(issuesTable, {
  project: d.ref.one(() => projectsTable, 'projectId'),
  assignee: d.ref.one(() => usersTable, 'assigneeId'),
  createdBy: d.ref.one(() => usersTable, 'createdById'),
  labels: d.ref.many(() => labelsTable).through(
    () => issueLabelsTable,
    'issueId',
    'labelId',
  ),
});

export const commentsModel = d.model(commentsTable, {
  issue: d.ref.one(() => issuesTable, 'issueId'),
  author: d.ref.one(() => usersTable, 'authorId'),
});
```

**Relation graph:**

```
projects ──one──> users (lead)
issues   ──one──> projects (project)
issues   ──one──> users (assignee, createdBy)
issues   ──many─> labels (through issue_labels)
comments ──one──> issues (issue)
comments ──one──> users (author)
labels   ──one──> projects (project)
```

This graph creates cross-entity dependencies at every level — updating a user's name propagates to projects (lead), issues (assignee, createdBy), and comments (author) simultaneously.

### 1.2 Entity Definitions (Backend)

```typescript
// src/api/entities/projects/projects.entity.ts
import { entity } from '@vertz/server';
import { projectsModel } from '../../schema';

export const projects = entity('projects', {
  model: projectsModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
```

Same pattern for `issues`, `comments`, `labels`, `users`.

### 1.3 Server

```typescript
// src/api/server.ts
import { createServer } from '@vertz/server';
import { db } from './db';
import { projects } from './entities/projects/projects.entity';
import { issues } from './entities/issues/issues.entity';
import { comments } from './entities/comments/comments.entity';
import { labels } from './entities/labels/labels.entity';
import { users } from './entities/users/users.entity';

export const server = createServer({
  basePath: '/api',
  entities: [projects, issues, comments, labels, users],
  db,
});
```

### 1.4 Frontend Views

**Route structure:**

```typescript
// src/router.ts
import { defineRoutes } from '@vertz/ui';

export const routes = defineRoutes({
  '/': {
    component: () => WorkspaceLayout(),
    children: {
      '/projects': { component: () => ProjectListPage() },
      '/projects/:slug': {
        component: () => ProjectLayout(),
        children: {
          '/': { component: () => ProjectBoardPage() },
          '/list': { component: () => ProjectListViewPage() },
        },
      },
      '/issues/:id': { component: () => IssueDetailPage() },
    },
  },
});
```

**Key pages and what they exercise:**

| Page | Vertz Features |
|------|----------------|
| `WorkspaceLayout` | `RouterView`, `Outlet`, `ThemeProvider`, context |
| `ProjectListPage` | `query()`, `ListTransition`, `css()` |
| `ProjectBoardPage` | `query()` per status column, deep normalization (issues → assignee/labels), cross-entity propagation, `ListTransition` |
| `ProjectListViewPage` | Same data as board, table/list layout, sorting |
| `IssueDetailPage` | `query()` single issue, `form()` for editing, comments feed, optimistic updates |

### 1.5 Deep Normalization in Action

The board page fetches issues with nested assignees and labels. Deep normalization extracts them:

```typescript
// ProjectBoardPage — simplified
function StatusColumn({ status, projectSlug }: StatusColumnProps) {
  const issues = query(
    () => issuesApi.list({ project: projectSlug, status }),
    { key: `issues-${projectSlug}-${status}` },
  );

  // issues.data.items contains issues with resolved assignee/label objects
  // Under the hood:
  // 1. Server returns: { id: 'i1', title: '...', assignee: { id: 'u1', name: 'Alice' } }
  // 2. EntityStore.merge() normalizes: issue.assignee → 'u1', users['u1'] → { name: 'Alice' }
  // 3. resolveReferences() reconstructs: issue.assignee → { id: 'u1', name: 'Alice' }

  return (
    <div class={styles.column}>
      <h3>{status}</h3>
      <ListTransition each={issues.data?.items ?? []} keyFn={(i) => i.id}>
        {(issue) => <IssueCard issue={issue} />}
      </ListTransition>
    </div>
  );
}
```

**Cross-entity propagation demo:** Editing a user's name in settings updates every `IssueCard` where that user is the assignee — across all status columns, across all projects — without refetching.

### 1.6 Optimistic Updates in Action

```typescript
function IssueStatusSelect({ issue }: { issue: Issue }) {
  const handleStatusChange = async (newStatus: string) => {
    // Optimistic: card moves to new column immediately
    await issuesApi.update(issue.id, { status: newStatus });
    // If server rejects, card snaps back to original column
  };

  return (
    <select value={issue.status} onChange={(e) => handleStatusChange(e.target.value)}>
      <option value="backlog">Backlog</option>
      <option value="todo">Todo</option>
      <option value="in_progress">In Progress</option>
      <option value="done">Done</option>
    </select>
  );
}
```

---

## 2. Manifesto Alignment

### Explicit over implicit

- Every entity relation is declared in the schema — no magic detection
- Route structure is a plain object — no file-system routing
- Status values are explicit strings, not enums hiding behind numbers

### Convention over configuration

- One entity definition per file, same directory structure as `entity-todo`
- `query()` for reads, `form()` for writes — no alternative patterns
- Standard Vertz project layout (`src/api/`, `src/pages/`, `src/components/`)

### Compile-time over runtime

- Typed routes: `navigate('/projects/:slug')` rejects invalid paths at compile time
- Typed entity SDK: `issuesApi.update(id, { stauts: '...' })` catches typos
- Schema validation on forms catches invalid data before submission

### If you can't demo it, it's not done

This example IS the demo. Every framework feature must work end-to-end in this app before it's considered shipped.

### Tradeoffs accepted

- **No drag-and-drop for MVP.** Status changes via dropdown, not drag. Drag-and-drop is a UI primitive that needs framework support (`@vertz/ui-primitives`). Building it as a one-off in the example would violate "one way to do things." Deferred to post-MVP.
- **No real-time collaboration.** Single-user for MVP. WebSocket/SSE live updates are a framework feature, not an example concern.
- **No rich text editor.** Plain text for descriptions and comments in MVP. Rich text is a third-party integration concern.

---

## 3. Non-Goals

- **Not a production Linear replacement.** It's a framework showcase that happens to be useful.
- **No authentication in MVP.** Single-user mode with a hardcoded seed user. Auth is a separate framework feature (`@vertz/auth`).
- **No real-time sync.** Optimistic updates handle single-client latency. Multi-client sync is a future framework feature.
- **No mobile layout.** Desktop-first. Responsive design is nice-to-have, not MVP.
- **No drag-and-drop.** Status changes via UI controls. Drag is deferred until `@vertz/ui-primitives` supports it.
- **No keyboard shortcuts / command palette.** Deferred to post-MVP. May become a framework feature.
- **No notifications / toast messages.** Deferred. May become a `@vertz/ui` primitive.

---

## 4. Unknowns

### 4.1 Many-to-many deep normalization (needs POC)

**Question:** Does the current deep normalization pipeline handle many-to-many relations through join tables? The `d.ref.many().through()` API exists at the schema level, but the codegen → `generateRelationManifest()` → `registerRelationSchema()` → `normalizeEntity()` pipeline has only been tested with direct one/many relations.

**Resolution strategy:** POC — create a minimal test with `issues → labels` through `issue_labels` and verify the full pipeline: server response → EntityStore merge → resolveReferences.

### 4.2 Nested route layouts with shared queries

**Question:** When `WorkspaceLayout` fetches the project list (sidebar) and `ProjectBoardPage` fetches issues, do both queries coexist correctly? Specifically: does `Outlet` preserve the parent's disposal scope so parent queries survive child route changes?

**Resolution strategy:** Discussion — review `RouterView` + `Outlet` implementation to confirm disposal scope boundaries.

### 4.3 Query invalidation across entity types

**Question:** When an issue is updated (status change), do queries for the same project but different status columns revalidate? The `MutationEventBus` broadcasts by entity type (`issues`), so all `issues` queries should revalidate. But does filtering by status at the query level cause stale data?

**Resolution strategy:** Discussion — the entity-backed query pipeline should handle this since queries track entity IDs, not filter parameters. Confirm with existing test coverage.

---

## 5. POC Results

*To be filled after POCs are completed.*

---

## 6. Type Flow Map

```
Schema layer:
  d.table() → TableDef<TName>
  d.model(table, { rel: d.ref.one(target, fk) }) → ModelDef<TTable, TRelations>

Server layer:
  entity(name, { model }) → EntityDefinition<TModel>
  createServer({ entities }) → Server (serves typed REST endpoints)

Compiler layer:
  EntityAnalyzer → EntityRelationIR { name, type, entity }
  IR Adapter → CodegenRelation { name, type, entity }
  Codegen → client.ts with registerRelationSchema() calls

UI layer:
  registerRelationSchema(entityType, schema) → global registry
  query(fetchFn) → QueryResult<T>
    → EntityStore.merge(type, data)
      → normalizeEntity(data, schema) → bare IDs + extracted entities
    → resolveReferences(raw, type, store)
      → reconstructed objects with signal dependencies
    → Signal update propagates to all computed consumers
```

Each arrow is a type boundary tested by existing or planned tests.

---

## 7. Directory Structure

```
examples/linear/
├── src/
│   ├── api/
│   │   ├── schema.ts                    # All tables + models with relations
│   │   ├── server.ts                    # createServer()
│   │   ├── db.ts                        # createSqliteAdapter()
│   │   ├── seed.ts                      # Seed data (projects, issues, users)
│   │   └── entities/
│   │       ├── projects/
│   │       │   └── projects.entity.ts
│   │       ├── issues/
│   │       │   └── issues.entity.ts
│   │       ├── comments/
│   │       │   └── comments.entity.ts
│   │       ├── labels/
│   │       │   └── labels.entity.ts
│   │       └── users/
│   │           └── users.entity.ts
│   ├── pages/
│   │   ├── workspace-layout.tsx         # Sidebar + Outlet
│   │   ├── project-list-page.tsx        # Project grid/list
│   │   ├── project-layout.tsx           # Project header + view toggle + Outlet
│   │   ├── project-board-page.tsx       # Kanban columns by status
│   │   ├── project-list-view-page.tsx   # Table/list view of issues
│   │   └── issue-detail-page.tsx        # Full issue view + comments
│   ├── components/
│   │   ├── issue-card.tsx               # Card in kanban column
│   │   ├── issue-form.tsx               # Create/edit issue (dialog)
│   │   ├── comment-form.tsx             # Add comment
│   │   ├── comment-item.tsx             # Single comment
│   │   ├── project-card.tsx             # Project in list
│   │   ├── sidebar.tsx                  # Navigation sidebar
│   │   ├── avatar.tsx                   # User avatar
│   │   ├── status-badge.tsx             # Status indicator
│   │   └── priority-icon.tsx            # Priority indicator
│   ├── lib/
│   │   ├── types.ts                     # Shared domain types
│   │   └── workspace-context.ts         # Workspace-level context
│   ├── styles/
│   │   ├── theme.ts                     # defineTheme() with Linear-inspired palette
│   │   └── components.ts               # Shared css() and variants()
│   ├── app.tsx                          # App shell
│   ├── router.ts                        # Route definitions
│   ├── entry-client.ts                  # Client entry
│   └── entry-server.tsx                 # SSR entry
├── e2e/
│   └── linear.spec.ts                   # Playwright E2E tests
├── vertz.config.ts
├── package.json
├── tsconfig.json
└── biome.json
```

---

## 8. Phased Build Plan

### Phase 1: Backend — Schema + Entities + Seed Data

**Goal:** Server serves all five entity types via REST API with seed data.

**Work:**
- Define all tables, models, and relations in `schema.ts`
- Create entity definitions with open access rules
- Set up SQLite adapter with auto-migrations
- Seed script: 2 users, 3 projects, ~20 issues across statuses, 5 labels, ~10 comments
- Server configuration with all entities

**Integration test:**
- `GET /api/projects` returns list with `lead` relation populated
- `GET /api/issues?project=<slug>` returns issues with `assignee`, `createdBy`, and `labels` populated
- `POST /api/issues` creates an issue and `GET /api/issues/:id` returns it with relations
- `GET /api/comments?issue=<id>` returns comments with `author` populated

**Acceptance:** API serves all entities with nested relations. Codegen generates typed SDK.

---

### Phase 2: Frontend Shell — Layout + Routing + Theme

**Goal:** App shell with sidebar, routing, and theme system. No data — static layout only.

**Work:**
- `defineTheme()` with Linear-inspired color palette (dark mode default)
- `defineRoutes()` with nested layout structure
- `WorkspaceLayout`: sidebar with project links + `Outlet`
- `ProjectLayout`: project header with board/list toggle + `Outlet`
- Placeholder pages for each route
- `ThemeProvider` wrapping the app

**Integration test:**
- Navigate to `/projects` → sees project list placeholder
- Navigate to `/projects/my-project` → sees board placeholder with project name
- Navigate to `/projects/my-project/list` → sees list view placeholder
- Sidebar highlights current project
- Theme toggle switches dark/light mode

**Acceptance:** Full navigation works. Layout renders with correct nesting.

---

### Phase 3: Project List + Issue Board (Read-Only)

**Goal:** Fetch and display real data. Board shows issues organized by status columns.

**Work:**
- `ProjectListPage`: `query()` for projects list, render project cards with lead avatar
- `ProjectBoardPage`: `query()` per status column, render issue cards with assignee avatars and label badges
- `IssueCard` component with status, priority, title, assignee
- `StatusBadge`, `PriorityIcon`, `Avatar` components
- `ListTransition` on issue cards for animated list changes

**Deep normalization exercised:** Each issue card displays the assignee's name and avatar. When the board loads, the store normalizes `issue.assignee → bare ID` and `users[userId] → user object`. Multiple issues by the same assignee share one user entry.

**Integration test:**
- Board page shows 4 status columns (backlog, todo, in_progress, done)
- Each column displays correct issues from seed data
- Issue cards show assignee name and labels
- Project list shows projects with lead name

**Acceptance:** Real data renders. Entity store contains normalized users/labels.

---

### Phase 4: Issue Detail + Comments

**Goal:** Full issue view with comments feed and comment form.

**Work:**
- `IssueDetailPage`: `query()` single issue with relations, display all fields
- Comments feed: `query()` comments for issue, `ListTransition` for animated list
- `CommentForm`: `form()` with `commentsApi.create`, inline below comments
- `CommentItem`: author avatar, body, timestamp
- Dialog or sidebar presentation (TBD based on routing — may use modal or full page)

**Integration test:**
- Navigate to `/issues/:id` → displays issue title, description, status, assignee, labels
- Comments section shows all comments with author names and timestamps
- Submit comment form → comment appears in list (optimistic or after refetch)
- Comment form resets after successful submission

**Acceptance:** Full issue view with working comment submission.

---

### Phase 5: Issue Mutations — Create + Edit + Status Change

**Goal:** Full CRUD for issues with optimistic updates and cross-entity propagation.

**Work:**
- `IssueForm` component: `form()` with schema validation, used in dialog
- Create issue: dialog from board page, form validates, optimistic insert into correct column
- Edit issue: dialog from issue detail, form prefilled, optimistic field updates
- Status change: dropdown on issue card, optimistic move between columns
- `createOptimisticHandler()` wired to `issuesApi.update` and `issuesApi.create`
- `MutationEventBus` triggers board query revalidation on issue mutations

**Cross-entity propagation exercised:** When user A edits their own profile name, every issue card where they appear as assignee updates reactively — no refetch, just signal propagation through `resolveReferences()`.

**Integration test:**
- Create issue via dialog → card appears in correct status column
- Edit issue title → title updates on board card and detail page
- Change issue status → card moves to new column (optimistic, no refetch)
- Change status, server rejects → card snaps back to original column
- Update user name → all issue cards with that assignee reflect new name

**Acceptance:** Full CRUD works. Optimistic updates are visible. Cross-entity propagation works.

---

### Phase 6: Labels + Filtering

**Goal:** Label management and basic issue filtering.

**Work:**
- Label CRUD within project settings (or inline)
- Assign/remove labels on issues (many-to-many mutation)
- Filter issues by assignee, label, priority on board and list views
- Filter state stored in search params (`useSearchParams()`)
- List view page with sortable columns

**Integration test:**
- Assign label to issue → label badge appears on card
- Filter by assignee → only matching issues shown
- Filter persists in URL search params
- Remove filter → all issues shown again

**Acceptance:** Labels work end-to-end. Filtering works with URL persistence.

---

### Phase 7: Polish + E2E Tests

**Goal:** Visual polish, animations, comprehensive E2E test suite.

**Work:**
- Enter/exit animations on issue cards (`ListTransition`)
- `Presence` animations on dialogs and panels
- Loading states (`Suspense` for async routes, query loading indicators)
- Error boundaries at route level
- Empty states (no issues in column, no projects)
- Playwright E2E tests covering all critical paths

**Integration test:** Full Playwright suite (see section 9).

**Acceptance:** App feels polished. All E2E tests pass.

---

## 9. E2E Acceptance Test

The following Playwright test validates the complete feature set:

```typescript
// e2e/linear.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Linear Clone', () => {
  test('project board displays issues by status with assignee names', async ({ page }) => {
    await page.goto('/projects/engineering');

    // Board has status columns
    await expect(page.getByTestId('column-backlog')).toBeVisible();
    await expect(page.getByTestId('column-todo')).toBeVisible();
    await expect(page.getByTestId('column-in_progress')).toBeVisible();
    await expect(page.getByTestId('column-done')).toBeVisible();

    // Issues show assignee names (deep normalization resolved)
    const card = page.getByTestId('issue-card').first();
    await expect(card.getByTestId('assignee-name')).not.toBeEmpty();
  });

  test('create issue optimistically appears in board', async ({ page }) => {
    await page.goto('/projects/engineering');

    // Open create dialog
    await page.getByRole('button', { name: 'New Issue' }).click();
    await page.getByLabel('Title').fill('Fix login bug');
    await page.getByLabel('Status').selectOption('todo');
    await page.getByRole('button', { name: 'Create' }).click();

    // Issue appears in Todo column (optimistic)
    await expect(
      page.getByTestId('column-todo').getByText('Fix login bug'),
    ).toBeVisible();
  });

  test('status change moves card between columns', async ({ page }) => {
    await page.goto('/projects/engineering');

    // Find an issue in Backlog
    const backlogCard = page.getByTestId('column-backlog').getByTestId('issue-card').first();
    const issueTitle = await backlogCard.getByTestId('issue-title').textContent();

    // Change status to In Progress
    await backlogCard.getByTestId('status-select').selectOption('in_progress');

    // Card moves to In Progress column
    await expect(
      page.getByTestId('column-in_progress').getByText(issueTitle!),
    ).toBeVisible();
  });

  test('cross-entity propagation: user name update reflects in issue cards', async ({ page }) => {
    // This test requires a way to trigger a user update
    // (e.g., settings page or direct API call)
    await page.goto('/projects/engineering');

    // Get current assignee name from a card
    const card = page.getByTestId('issue-card').first();
    const originalName = await card.getByTestId('assignee-name').textContent();

    // Update the user's name via API
    await page.evaluate(async () => {
      await fetch('/api/users/u1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      });
    });

    // The card reflects the new name without page reload
    await expect(card.getByTestId('assignee-name')).toHaveText('Updated Name');
  });

  test('add comment to issue', async ({ page }) => {
    await page.goto('/issues/i1');

    await page.getByLabel('Add a comment').fill('Looks good to me!');
    await page.getByRole('button', { name: 'Comment' }).click();

    await expect(page.getByText('Looks good to me!')).toBeVisible();
  });

  test('navigation preserves sidebar state', async ({ page }) => {
    await page.goto('/projects');

    // Navigate to a project
    await page.getByText('Engineering').click();
    await expect(page).toHaveURL(/\/projects\/engineering/);

    // Sidebar still shows project list
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('sidebar').getByText('Engineering')).toBeVisible();

    // Navigate to issue detail
    await page.getByTestId('issue-card').first().click();

    // Sidebar still visible
    await expect(page.getByTestId('sidebar')).toBeVisible();
  });
});
```

---

## 10. Feature Coverage Map

Which Vertz features each part of the app exercises:

| Feature | Where Exercised |
|---------|----------------|
| **Deep normalization** (write-side) | Issue cards: `issue.assignee` normalized to bare ID on merge |
| **Deep normalization** (read-side) | Issue cards: `resolveReferences()` reconstructs assignee object |
| **Cross-entity propagation** | User name change → all issue cards update reactively |
| **Optimistic updates** | Status change → card moves instantly, rolls back on failure |
| **`query()`** | Every data-displaying page |
| **`form()`** | Issue create/edit dialog, comment form |
| **`defineRoutes()` + nested layouts** | Workspace → Project → Board/List routing |
| **`RouterView` + `Outlet`** | Nested layout rendering |
| **`ListTransition`** | Issue card enter/exit animations |
| **`Presence`** | Dialog open/close animations |
| **`css()` + `variants()`** | All component styling |
| **`defineTheme()` + `ThemeProvider`** | Dark/light mode |
| **`createDialogStack()`** | Issue create/edit modals |
| **`createContext()` + `useContext()`** | Workspace context (current project, user) |
| **`useParams()`** | Project slug, issue ID from URL |
| **`useSearchParams()`** | Filter state persistence |
| **`ErrorBoundary`** | Route-level error handling |
| **`Suspense`** | Async route component loading |
| **Entity codegen** | Typed SDK for all entity operations |
| **Many-to-many relations** | Issues ↔ Labels through join table |
| **Ref counting** | Issue card disposal removes entity references |
| **Query revalidation** | `MutationEventBus` triggers refetch after mutations |
| **SSR** | Server-rendered initial page load |

---

## 11. Seed Data

Enough data to make the app feel alive on first load:

- **2 users:** Alice (project lead) and Bob (developer)
- **3 projects:** Engineering, Design, Documentation — each with a lead and color
- **5 labels per project:** bug, feature, improvement, documentation, urgent
- **~20 issues** spread across projects and statuses, with varying priorities, assignees, and labels
- **~10 comments** across different issues

Seed runs automatically on first server start (empty database detection).
