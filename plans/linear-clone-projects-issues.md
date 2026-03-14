# Linear Clone — Phase 1: Projects & Issues

> **Status:** Draft — Rev 3 (addressing DX, Product, Technical re-reviews)
> **Depends on:** Phase 0 (GitHub OAuth) — complete
> **Example app:** `examples/linear/`

---

## Overview

Add the core domain to the Linear clone example: **Projects** and **Issues**. This demonstrates Vertz's entity system, query/form APIs, routing, and reactive UI in a realistic project management app.

---

## API Surface

### Database Schema

```ts
// src/api/schema.ts
import { d } from '@vertz/db';

// ── Users (existing, unchanged) ─────────────────────────────
export const usersTable = d.table('users', { /* ... existing ... */ });
export const usersModel = d.model(usersTable);

// ── Projects ────────────────────────────────────────────────
export const projectsTable = d.table('projects', {
  id: d.uuid().primary({ generate: 'uuid' }),
  name: d.text(),
  key: d.text().unique(),        // e.g. "VER" — used for issue identifiers
  description: d.text().nullable(),
  createdBy: d.text().readOnly(),  // set by before.create hook — excluded from $create_input
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const projectsModel = d.model(projectsTable);

// ── Issues ──────────────────────────────────────────────────
export const issuesTable = d.table('issues', {
  id: d.uuid().primary({ generate: 'uuid' }),
  projectId: d.uuid(),           // FK → projects.id
  number: d.integer().readOnly(),  // set by before.create hook — excluded from $create_input
  title: d.text(),
  description: d.text().nullable(),
  status: d.text().default('backlog'),    // backlog | todo | in_progress | done | cancelled
  priority: d.text().default('none'),     // urgent | high | medium | low | none
  assigneeId: d.text().nullable(),        // FK → users.id (text, auth IDs are text)
  createdBy: d.text().readOnly(),         // set by before.create hook — excluded from $create_input
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const issuesModel = d.model(issuesTable);
```

**Design decisions:**
- `projectId` uses `d.uuid()` to match `projects.id` FK target type.
- `assigneeId` uses `d.text()` since auth user IDs are text strings.
- `createdBy` and `number` are marked `.readOnly()` — this excludes them from `$create_input` so client forms don't need to provide them. The `before.create` hook sets them server-side.
- `updatedAt` uses `.autoUpdate()` without redundant `.readOnly()` — `autoUpdate()` already implies read-only.
- `status` and `priority` use `d.text()` with defaults. `d.enum()` would add SQLite compatibility concerns for minimal gain in an example app.

### Entity Definitions

```ts
// src/api/entities/users.entity.ts (updated — migrate to rules.*)
import { entity, rules } from '@vertz/server';
import { usersModel } from '../schema';

export const users = entity('users', {
  model: usersModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
```

```ts
// src/api/entities/projects.entity.ts
import { entity, rules } from '@vertz/server';
import { projectsModel } from '../schema';

export const projects = entity('projects', {
  model: projectsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
  },
  before: {
    create: (data, ctx) => ({ ...data, createdBy: ctx.userId }),
  },
});
```

```ts
// src/api/entities/issues.entity.ts
import { entity, rules } from '@vertz/server';
import { issuesModel } from '../schema';

export const issues = entity('issues', {
  model: issuesModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.authenticated(),
    delete: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })),
  },
  before: {
    create: async (data, ctx) => {
      // Auto-increment issue number per project.
      // Note: no concurrent-safety guarantee — acceptable for single-user example.
      // Production would use a DB-level sequence or SELECT ... FOR UPDATE.
      const existing = await ctx.entity.list({
        where: { projectId: data.projectId },
        orderBy: { number: 'desc' },
        limit: 1,
      });
      const nextNumber = existing.items.length > 0 ? existing.items[0].number + 1 : 1;
      return { ...data, number: nextNumber, createdBy: ctx.userId };
    },
  },
});
```

**Design decisions:**
- `inject` removed from issues entity — it was unused. The `before.create` hook uses `ctx.entity` (self-reference) to query existing issues, which doesn't need inject.
- `users.entity.ts` migrated from callback functions (`() => true`) to `rules.public` — consistent with the entity-access-rules convention. All entities in the example now use `rules.*` descriptors.
- `import { entity, rules } from '@vertz/server'` — both are public exports.

### Server Registration

```ts
// src/api/server.ts (updated — add projects and issues entities)
import { createServer, github } from '@vertz/server';
import { db } from './db';
import { users } from './entities/users.entity';
import { projects } from './entities/projects.entity';
import { issues } from './entities/issues.entity';

export const app = createServer({
  basePath: '/api',
  entities: [users, projects, issues],
  // biome-ignore lint/suspicious/noExplicitAny: DatabaseClient model variance — known framework gap
  db: db as any,
  auth: { /* existing config unchanged */ },
});
```

**Note:** The `db as any` cast is a known framework limitation with DatabaseClient model variance. Tracked separately — not in scope for this example app work.

### Database Setup

```ts
// src/api/db.ts (updated — add CREATE TABLE for projects and issues)
// Inside createBunD1(), add after the users table creation:

sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

sqlite.exec(`CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'none',
  assignee_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, number)
)`);

// In createDb() models config:
export const db = createDb({
  models: { ...authModels, users: usersModel, projects: projectsModel, issues: issuesModel },
  dialect: 'sqlite',
  d1: d1 as any,
});
```

**Design decisions:**
- `UNIQUE(project_id, number)` compound constraint prevents duplicate issue numbers per project at the DB level — safety net for the application-level auto-increment.
- `REFERENCES` constraints for foreign keys (projects → issues, users → assignee).
- Column names use snake_case to match the framework's DB convention (camelCase in TypeScript, snake_case in SQL).

### Routes

```ts
// src/router.tsx (updated)
import { createRouter, defineRoutes, onMount, useRouter } from '@vertz/ui';
import { ProtectedRoute } from '@vertz/ui/auth';
import { WorkspaceShell } from './components/auth-guard';
import { LoginPage } from './pages/login-page';
import { ProjectsPage } from './pages/projects-page';
import { ProjectLayout } from './components/project-layout';
import { IssueListPage } from './pages/issue-list-page';
import { IssueDetailPage } from './pages/issue-detail-page';

/** Redirect `/` → `/projects` — existing, no changes needed. */
function IndexRedirect() {
  const { navigate } = useRouter();
  onMount(() => { navigate({ to: '/projects' }); });
  return <div />;
}

export const routes = defineRoutes({
  '/login': { component: () => LoginPage() },
  '/': {
    component: () =>
      ProtectedRoute({
        loginPath: '/login',
        fallback: () => <div>Loading...</div>,
        children: () => <WorkspaceShell />,
      }),
    children: {
      '/': { component: () => IndexRedirect() },
      '/projects': { component: () => ProjectsPage() },
      '/projects/:projectId': {
        component: () => ProjectLayout(),
        children: {
          '/': { component: () => IssueListPage() },
          '/issues/:issueId': { component: () => IssueDetailPage() },
        },
      },
    },
  },
});

export const appRouter = createRouter(routes, { serverNav: true });
```

### Layout — Project Layout (nested Outlet)

```tsx
// src/components/project-layout.tsx
import { css, Outlet, query } from '@vertz/ui';
import { useParams, Link } from '@vertz/ui';

const styles = css({
  header: ['flex', 'items:center', 'gap:3', 'mb:6'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
  backLink: ['text:sm', 'text:muted-foreground'],
});

export function ProjectLayout() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const project = query(() => projectApi.get(projectId), { key: `project-${projectId}` });

  return (
    <div>
      <header class={styles.header}>
        <Link href="/projects" class={styles.backLink}>Projects</Link>
        <span>/</span>
        <h1 class={styles.title}>{project.data?.name}</h1>
      </header>
      {Outlet()}
    </div>
  );
}
```

**Note:** This demonstrates nested layouts with `Outlet()` — one of the framework's key routing features. The project header persists while the outlet swaps between issue list and issue detail.

### Sidebar Navigation (updated WorkspaceShell)

```tsx
// src/components/auth-guard.tsx (updated)
export function WorkspaceShell() {
  const auth = useAuth();
  const projects = query(() => projectApi.list(), { key: 'sidebar-projects' });

  const handleSignOut = async () => {
    await auth.signOut({ redirectTo: '/login' });
  };

  return (
    <div class={sidebarStyles.shell}>
      <aside class={sidebarStyles.sidebar} data-testid="sidebar">
        <div class={sidebarStyles.brand}>Linear Clone</div>
        <nav class={sidebarStyles.nav}>
          <Link href="/projects" class={sidebarStyles.navItem}>Projects</Link>
          {projects.data?.items.map((project) => (
            <Link
              href={`/projects/${project.id}`}
              class={sidebarStyles.projectLink}
              key={project.id}
            >
              {project.key} — {project.name}
            </Link>
          ))}
        </nav>
        {/* ... user section unchanged ... */}
      </aside>
      <main class={sidebarStyles.main}>{Outlet()}</main>
    </div>
  );
}
```

**Design decision:** The sidebar fetches the project list with `query()` — demonstrating reactive data fetching in a layout component. When a new project is created, `projects.refetch()` updates the sidebar. This is a common real-world pattern (sidebar navigation reflecting server state).

### Pages — Projects

```tsx
// src/pages/projects-page.tsx
import { css, query, Link } from '@vertz/ui';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:6'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
  grid: ['grid', 'grid-cols:1', 'gap:3'],
  empty: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:16', 'text:center'],
  emptyTitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
  emptyDescription: ['text:sm', 'text:muted-foreground'],
});

export function ProjectsPage() {
  const projects = query(() => projectApi.list(), { key: 'projects' });
  let showCreateDialog = false;

  return (
    <div class={styles.container}>
      <header class={styles.header}>
        <h1 class={styles.title}>Projects</h1>
        <button onClick={() => { showCreateDialog = true; }}>New Project</button>
      </header>

      {projects.loading && <div>Loading...</div>}

      {!projects.loading && projects.data?.items.length === 0 && (
        <div class={styles.empty}>
          <h2 class={styles.emptyTitle}>No projects yet</h2>
          <p class={styles.emptyDescription}>Create your first project to get started.</p>
        </div>
      )}

      <div class={styles.grid}>
        {projects.data?.items.map((project) => (
          <Link href={`/projects/${project.id}`} key={project.id}>
            <ProjectCard project={project} />
          </Link>
        ))}
      </div>

      {showCreateDialog && (
        <CreateProjectDialog
          onClose={() => { showCreateDialog = false; }}
          onSuccess={() => {
            showCreateDialog = false;
            projects.refetch();
          }}
        />
      )}
    </div>
  );
}
```

### Pages — Issues List

```tsx
// src/pages/issue-list-page.tsx
import { css, query, Link } from '@vertz/ui';
import { useParams } from '@vertz/ui';

export function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(() => issueApi.list({ where: { projectId } }), {
    key: `issues-${projectId}`,
  });
  const project = query(() => projectApi.get(projectId), { key: `project-${projectId}` });

  let statusFilter = 'all';
  let showCreateDialog = false;

  const filtered = statusFilter === 'all'
    ? issues.data?.items
    : issues.data?.items.filter((i) => i.status === statusFilter);

  return (
    <div>
      <header>
        <StatusFilter value={statusFilter} onChange={(v) => { statusFilter = v; }} />
        <button onClick={() => { showCreateDialog = true; }}>New Issue</button>
      </header>

      {issues.loading && <div>Loading...</div>}

      {!issues.loading && issues.data?.items.length === 0 && (
        <div>No issues yet. Create your first issue.</div>
      )}

      {filtered?.map((issue) => (
        <Link href={`/projects/${projectId}/issues/${issue.id}`} key={issue.id}>
          <IssueRow issue={issue} projectKey={project.data?.key} />
        </Link>
      ))}

      {showCreateDialog && (
        <CreateIssueDialog
          projectId={projectId}
          onClose={() => { showCreateDialog = false; }}
          onSuccess={() => {
            showCreateDialog = false;
            issues.refetch();
          }}
        />
      )}
    </div>
  );
}
```

### Pages — Issue Detail

**Resolved Unknown #2:** The detail view only renders after query data loads, so all values are concrete. Inline updates use direct SDK calls (not `form()`) since these are programmatic single-field mutations, not form submissions.

```tsx
// src/pages/issue-detail-page.tsx
import { css, query } from '@vertz/ui';
import { useParams } from '@vertz/ui';

export function IssueDetailPage() {
  const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
  const issue = query(() => issueApi.get(issueId), { key: `issue-${issueId}` });
  const project = query(() => projectApi.get(projectId), { key: `project-${projectId}` });

  const handleStatusChange = async (status: string) => {
    await issueApi.update(issueId, { status });
    issue.refetch();
  };

  const handlePriorityChange = async (priority: string) => {
    await issueApi.update(issueId, { priority });
    issue.refetch();
  };

  return (
    <div>
      {issue.loading && <div>Loading...</div>}

      {issue.data && (
        <div>
          <header>
            <span>{project.data?.key}-{issue.data.number}</span>
            <h2>{issue.data.title}</h2>
          </header>

          {issue.data.description && <p>{issue.data.description}</p>}

          <aside>
            <StatusSelect value={issue.data.status} onChange={handleStatusChange} />
            <PrioritySelect value={issue.data.priority} onChange={handlePriorityChange} />
          </aside>
        </div>
      )}
    </div>
  );
}
```

**Design decision:** Inline status/priority updates use direct SDK calls (`issueApi.update()`) rather than `form()`. The `form()` API is designed for form-element-driven submissions with progressive enhancement. Programmatic single-field mutations are simpler and more honest as direct API calls + `refetch()`. This establishes a clear convention: `form()` for `<form>` elements, direct SDK for programmatic mutations.

### Create Project Dialog

```tsx
// src/components/create-project-dialog.tsx
import { form } from '@vertz/ui';

interface CreateProjectDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectDialog({ onClose, onSuccess }: CreateProjectDialogProps) {
  const createForm = form(projectApi.create, {
    initial: { name: '', key: '', description: '' },
    onSuccess,
  });

  return (
    <dialog open>
      <h3>New Project</h3>
      <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
        <label>
          Name
          <input name="name" placeholder="My Project" />
        </label>
        {createForm.name.error && <span>{createForm.name.error}</span>}

        <label>
          Key
          <input name="key" placeholder="PROJ" maxLength={5} style="text-transform: uppercase" />
        </label>
        {createForm.key.error && <span>{createForm.key.error}</span>}

        <label>
          Description
          <textarea name="description" placeholder="Optional description" />
        </label>

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={createForm.submitting}>
            {createForm.submitting ? 'Creating...' : 'Create Project'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
```

**Note on validation:** The `form()` call uses `projectApi.create` which has `.meta.bodySchema` auto-generated by codegen. This provides server-side validation (required fields, unique key constraint) with errors surfaced via `createForm.field.error`. No manual Zod schema needed in the example — the entity's model definition is the single source of truth for validation.

### Create Issue Dialog

```tsx
// src/components/create-issue-dialog.tsx
import { form } from '@vertz/ui';

interface CreateIssueDialogProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateIssueDialog({ projectId, onClose, onSuccess }: CreateIssueDialogProps) {
  const createForm = form(issueApi.create, {
    initial: { projectId, title: '', description: '', status: 'backlog', priority: 'none' },
    onSuccess,
  });

  return (
    <dialog open>
      <h3>New Issue</h3>
      <form action={createForm.action} method={createForm.method} onSubmit={createForm.onSubmit}>
        <label>
          Title
          <input name="title" placeholder="Issue title" />
        </label>
        {createForm.title.error && <span>{createForm.title.error}</span>}

        <label>
          Description
          <textarea name="description" placeholder="Optional description" />
        </label>

        <StatusSelect name="status" value={createForm.status.value} />
        <PrioritySelect name="priority" value={createForm.priority.value} />

        <input type="hidden" name="projectId" value={projectId} />

        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={createForm.submitting}>
            {createForm.submitting ? 'Creating...' : 'Create Issue'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
```

### Shared Components

```tsx
// src/components/project-card.tsx
import { css } from '@vertz/ui';

const styles = css({
  card: ['bg:card', 'rounded:lg', 'border:1', 'border:border', 'p:4', 'cursor:pointer'],
  name: ['font:medium', 'text:foreground', 'mb:1'],
  key: ['text:xs', 'text:muted-foreground', 'font:mono'],
  description: ['text:sm', 'text:muted-foreground', 'mt:2'],
});

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div class={styles.card}>
      <div class={styles.name}>{project.name}</div>
      <div class={styles.key}>{project.key}</div>
      {project.description && <p class={styles.description}>{project.description}</p>}
    </div>
  );
}
```

```tsx
// src/components/issue-row.tsx
import { css } from '@vertz/ui';

const styles = css({
  row: ['flex', 'items:center', 'gap:3', 'py:2', 'px:3', 'rounded:md', 'cursor:pointer'],
  identifier: ['text:xs', 'text:muted-foreground', 'font:mono', 'w:16'],
  title: ['flex-1', 'text:sm', 'text:foreground'],
  status: ['text:xs', 'px:2', 'py:0.5', 'rounded:full'],
  priority: ['text:xs', 'text:muted-foreground'],
});

export function IssueRow({ issue, projectKey }: { issue: Issue; projectKey?: string }) {
  return (
    <div class={styles.row}>
      <span class={styles.identifier}>{projectKey}-{issue.number}</span>
      <span class={styles.title}>{issue.title}</span>
      <span class={styles.status}>{issue.status}</span>
      <span class={styles.priority}>{issue.priority}</span>
    </div>
  );
}
```

```tsx
// src/components/status-filter.tsx
const STATUSES = ['all', 'backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const;

export function StatusFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      {STATUSES.map((status) => (
        <button
          key={status}
          onClick={() => onChange(status)}
          aria-pressed={value === status ? 'true' : 'false'}
        >
          {status === 'all' ? 'All' : status.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// src/components/status-select.tsx
const STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const;

export function StatusSelect({ value, onChange, name }: StatusSelectProps) {
  return (
    <select name={name} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
    </select>
  );
}
```

```tsx
// src/components/priority-select.tsx
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export function PrioritySelect({ value, onChange, name }: PrioritySelectProps) {
  return (
    <select name={name} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}
```

---

## Manifesto Alignment

### Principles Applied

1. **If it builds, it works** — Entity schemas define the DB, API, and client types. No manual wiring between layers.
2. **One way to do things** — CRUD follows the entity pattern. Forms use `form()`. Data fetching uses `query()`. All entities use `rules.*` descriptors (no callback functions). No alternative paths.
3. **AI agents are first-class users** — The entity/query/form pattern is predictable and composable. An LLM can generate a new entity + page in one shot.
4. **Test what matters** — Integration tests verify entity CRUD, access rules, and page rendering. No unit tests for framework internals.
5. **If you can't demo it, it's not done** — Each phase delivers a visible, interactive feature.

### Tradeoffs

- **Issue numbers use application-level auto-increment** with a `UNIQUE(project_id, number)` DB constraint as safety net. Simpler than a DB sequence for SQLite. Production would use `SELECT ... FOR UPDATE` or similar.
- **No optimistic updates for status changes.** The form submits and refetches. Optimistic updates can be added later.
- **Flat issue list, not a kanban board.** Board view is a natural follow-up but adds significant UI complexity.
- **`db as any` cast** is a known framework limitation with DatabaseClient model variance. Not addressed in this example — tracked as a framework issue.

### What Was Rejected

- **Separate "workspace" entity** — Adds multi-tenant complexity not needed for a single-user example.
- **Rich text editor for descriptions** — Out of scope. Plain text/textarea is sufficient.
- **Labels/tags system** — Adds entity relationship complexity. Deferred.
- **Comments on issues** — Deferred. Adds another entity + real-time considerations.
- **URL routing by project key + issue number** (e.g. `/VER/VER-42`) — More authentic to Linear, but requires entity lookup by non-PK fields. Deferred to keep Phase 1 simple. UUIDs in URLs work fine.

---

## Non-Goals

- **Multi-tenant / workspace support** — This is a single-user example. No tenant isolation.
- **Real-time updates** — No WebSocket push. Polling or manual refetch only.
- **Drag-and-drop board** — No kanban view.
- **Search / full-text filtering** — Basic status filter only.
- **Activity history / audit log** — No change tracking.
- **Cycles / sprints** — Not modeled.
- **Markdown rendering** — Descriptions are plain text.
- **Delete UI** — Access rules define delete permissions, but no delete button in the UI. Deferred to a follow-up phase where we can properly demonstrate access-rule-driven UI (show/hide delete button based on ownership).

---

## Unknowns

1. **Issue number auto-increment race condition** — The `before.create` hook reads the current max number and increments. Under concurrent creates, two issues could get the same number. **Resolution:** `UNIQUE(project_id, number)` DB constraint catches duplicates. Acceptable for a single-user example app. Production would use a DB-level sequence.

2. ~~**Form `initial` from async data**~~ **Resolved:** Extract the form into a child component (`IssueDetailView`) that only renders after the query resolves. The child receives concrete data, so `initial` values are synchronous. See `IssueDetailPage` in API Surface.

3. **Codegen step** — The client-side `projectApi` and `issueApi` objects are generated by `@vertz/codegen`. Need to verify that codegen runs automatically during dev (via the dev server) or if a manual `bun run codegen` step is needed. If manual, add it to the implementation plan. **Resolution:** Verify during Phase 1 implementation.

---

## POC Results

No POC needed. Phase 0 already validated:
- Entity CRUD with `createServer` + `entity()`
- `query()` / `form()` for data fetching and mutations
- Route parameters with `useParams()`
- Protected routes with `ProtectedRoute`

---

## Type Flow Map

```
projectsTable (d.table)
  → projectsModel (d.model) → infers $create_input, $update_input, $response
    → entity('projects', { model }) → generates REST endpoints
      → codegen → projectApi.list(): Promise<ListResponse<Project>>
        → query(() => projectApi.list()) → QueryResult<ListResponse<Project>>
          → JSX: {projects.data.items.map(...)} → auto-unwrapped signals

issuesTable (d.table)
  → issuesModel (d.model) → infers $create_input, $update_input, $response
    → entity('issues', { model }) → generates REST endpoints
      → codegen → issueApi.create(body): Promise<Issue>
        → form(issueApi.create) → FormInstance<IssueCreateInput>
          → JSX: <input name="title" /> + {createForm.title.error}

Route params:
  defineRoutes({ '/projects/:projectId/issues/:issueId': ... })
    → useParams<'/projects/:projectId/issues/:issueId'>()
      → { projectId: string, issueId: string }
```

No dead generics. Every type parameter flows from schema definition to UI consumption.

---

## E2E Acceptance Test

```ts
describe('Feature: Linear Clone Projects & Issues', () => {
  // ── Projects ──────────────────────────────────────────────

  describe('Given an authenticated user with no projects', () => {
    describe('When navigating to /projects', () => {
      it('Then shows empty state with "No projects yet" message', () => {});
      it('Then shows "New Project" button', () => {});
    });
  });

  describe('Given an authenticated user on the projects page', () => {
    describe('When clicking "New Project" and submitting the form', () => {
      it('Then creates a project with the given name and key', () => {});
      it('Then the project appears in the projects list', () => {});
      it('Then the project appears in the sidebar navigation', () => {});
    });

    describe('When submitting with an empty name', () => {
      it('Then shows a validation error on the name field', () => {});
    });

    describe('When submitting with a duplicate key', () => {
      it('Then shows an error that the key is already taken', () => {});
    });
  });

  describe('Given a project exists', () => {
    describe('When clicking the project in the list', () => {
      it('Then navigates to /projects/:projectId', () => {});
      it('Then shows the project name in the header breadcrumb', () => {});
      it('Then shows an empty issues list', () => {});
    });
  });

  // ── Issues ────────────────────────────────────────────────

  describe('Given a project with no issues', () => {
    describe('When clicking "New Issue" and submitting', () => {
      it('Then creates an issue with number 1', () => {});
      it('Then the issue appears in the list with identifier KEY-1', () => {});
      it('Then the issue has default status "backlog" and priority "none"', () => {});
    });
  });

  describe('Given a project with existing issues', () => {
    describe('When creating another issue', () => {
      it('Then auto-increments the issue number', () => {});
    });

    describe('When filtering by status "in_progress"', () => {
      it('Then shows only issues with status in_progress', () => {});
    });
  });

  describe('Given an issue exists', () => {
    describe('When clicking the issue in the list', () => {
      it('Then navigates to /projects/:projectId/issues/:issueId', () => {});
      it('Then shows the issue title and description', () => {});
      it('Then shows status and priority selectors', () => {});
    });

    describe('When changing the status to "in_progress"', () => {
      it('Then updates the issue status', () => {});
      it('Then the status change is reflected in the issue list', () => {});
    });

    describe('When changing the priority to "high"', () => {
      it('Then updates the issue priority', () => {});
    });
  });

  // ── Access Rules ──────────────────────────────────────────

  describe('Given an unauthenticated user', () => {
    describe('When accessing /api/projects', () => {
      it('Then returns 401 Unauthorized', () => {});
    });
  });

  describe('Given a user who did not create a project', () => {
    describe('When trying to delete that project via API', () => {
      it('Then returns 403 Forbidden', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Projects CRUD + UI

**Goal:** Users can create, view, and navigate to projects. Sidebar shows dynamic project list.

**Schema & entities:**
- Add `projectsTable` and `projectsModel` to `src/api/schema.ts`
- Add `CREATE TABLE IF NOT EXISTS projects` to `src/api/db.ts`
- Register `projectsModel` in `createDb({ models: { ... } })`
- Create `src/api/entities/projects.entity.ts` with `rules.*` access and `before.create`
- Register `projects` entity in `src/api/server.ts`
- Migrate `users.entity.ts` from callback access to `rules.public`

**Pages & components:**
- Update `ProjectsPage` with `query()` for project list + empty state
- Create `CreateProjectDialog` with `form()` bound to `projectApi.create`
- Create `ProjectCard` component
- Create `ProjectLayout` component with header breadcrumb + `Outlet()`
- Update `WorkspaceShell` sidebar with `query()` for dynamic project list

**Routes:**
- Add `/projects/:projectId` route with `ProjectLayout` and children placeholder

**Acceptance criteria:**
```ts
describe('Given an authenticated user', () => {
  describe('When navigating to /projects with no projects', () => {
    it('Then shows empty state with "No projects yet"', () => {});
  });
  describe('When creating a project via the dialog', () => {
    it('Then the project appears in the list', () => {});
    it('Then the project appears in the sidebar', () => {});
  });
  describe('When clicking a project', () => {
    it('Then navigates to /projects/:projectId with breadcrumb header', () => {});
  });
});
```

### Phase 2: Issues CRUD + List View

**Goal:** Users can create issues within a project and see them in a filterable list.

**Schema & entities:**
- Add `issuesTable` and `issuesModel` to `src/api/schema.ts`
- Add `CREATE TABLE IF NOT EXISTS issues` to `src/api/db.ts` (with compound unique constraint)
- Register `issuesModel` in `createDb({ models: { ... } })`
- Create `src/api/entities/issues.entity.ts` with auto-increment `before.create`
- Register `issues` entity in `src/api/server.ts`

**Pages & components:**
- Create `IssueListPage` with `query()` for issues filtered by `projectId`
- Create `CreateIssueDialog` with title, description, status, priority
- Create `IssueRow` component showing identifier (KEY-N), title, status, priority
- Create `StatusFilter` component
- Create `StatusSelect` and `PrioritySelect` shared components

**Acceptance criteria:**
```ts
describe('Given a project exists', () => {
  describe('When creating an issue', () => {
    it('Then assigns auto-incremented number', () => {});
    it('Then shows KEY-N identifier in the list', () => {});
    it('Then defaults to status "backlog" and priority "none"', () => {});
  });
  describe('When filtering by status', () => {
    it('Then shows only matching issues', () => {});
  });
});
```

### Phase 3: Issue Detail + Inline Updates

**Goal:** Users can view and update individual issues inline.

**Pages & components:**
- Create `IssueDetailPage` with conditional rendering (loading → detail view)
- Use direct SDK calls (`issueApi.update()`) for inline status/priority changes
- Wire navigation from issue list → detail and back

**Acceptance criteria:**
```ts
describe('Given an issue exists', () => {
  describe('When navigating to the issue detail', () => {
    it('Then shows identifier, title, description, status, and priority', () => {});
  });
  describe('When changing status via the select', () => {
    it('Then persists the change and reflects it on return to list', () => {});
  });
  describe('When changing priority', () => {
    it('Then persists the change', () => {});
  });
});
```

### Phase 4: Polish + Styling

**Goal:** The app looks and feels like a real project management tool.

- Apply consistent styling with `css()` and `variants()` using the Linear-inspired dark theme
- Status badges with semantic colors (yellow=backlog, blue=in_progress, green=done, etc.)
- Priority icons (urgent=red, high=orange, medium=yellow, low=blue, none=gray)
- Loading states with skeleton indicators
- Responsive layout adjustments

**Acceptance criteria:**
```ts
describe('Given the app is rendered', () => {
  describe('When viewing the issue list', () => {
    it('Then status badges show semantic colors', () => {});
    it('Then priority indicators are visible', () => {});
  });
  describe('When data is loading', () => {
    it('Then shows loading indicators', () => {});
  });
});
```

---

## Review Resolution Log

### DX Review (Josh) — Rev 1 → Rev 2
1. **[BLOCKER] `inject` uses model instead of entity** → Removed `inject` entirely (was unused).
2. **[BLOCKER] Missing `rules` import** → Added `import { entity, rules } from '@vertz/server'` to all entity files.
3. **[BLOCKER] `form()` with async `initial`** → Resolved with `IssueDetailView` child component pattern.
4. **[SHOULD-FIX] `FormData` pseudo-code** → Replaced with `form.field.setValue()` + `form.submit()`.
5. **[SHOULD-FIX] `users.entity.ts` inconsistency** → Added migration to `rules.public` in Phase 1.
6. **[SHOULD-FIX] `ProjectLayout` undefined** → Added full component definition.
7. **[SHOULD-FIX] Sidebar underspecified** → Added `WorkspaceShell` update with `query()`.
8. **[SHOULD-FIX] `IndexRedirect` status** → Noted as "existing, no changes needed."
9. **[SHOULD-FIX] No validation schema** → Documented that codegen provides `.meta.bodySchema`.
10. **[NIT] URLs use UUID not key/number** → Acknowledged in "What Was Rejected" as intentional simplification.
11. **[NIT] `EmptyState` undefined** → Inlined the empty state markup directly.
12. **[NIT] `ctx.entity` comment** → Added comment in `before.create` explaining the self-reference.

### Product/Scope Review — Rev 1 → Rev 2
1. **[BLOCKER] Missing `rules` import** → Fixed (same as DX #2).
2. **[BLOCKER] Unused `inject`** → Removed (same as DX #1).
3. **[SHOULD-FIX] Sidebar underspecified** → Fixed (same as DX #7).
4. **[SHOULD-FIX] Missing validation schema** → Documented codegen provides it.
5. **[SHOULD-FIX] `db as any` cast** → Added note acknowledging it as a known framework gap.
6. **[SHOULD-FIX] Awkward `form()` pattern** → Fixed with `setValue` + `submit()`.
7. **[SHOULD-FIX] `projectId` type mismatch** → Changed to `d.uuid()`.
8. **[SHOULD-FIX] No delete flow** → Added to Non-Goals with rationale for deferral.
9. **[NIT] Phase 4 keyboard shortcuts** → Removed (framework doesn't have a keyboard shortcut primitive).
10. **[NIT] Race condition comment** → Added in-code comment + DB constraint.
11. **[NIT] Codegen step** → Added as Unknown #3.

### Technical Review — Rev 1 → Rev 2
1. **[BLOCKER] `inject` type mismatch** → Removed `inject` (same as DX #1).
2. **[BLOCKER] Missing `rules` import** → Fixed (same as DX #2).
3. **[SHOULD-FIX] Race condition** → Added `UNIQUE(project_id, number)` constraint.
4. **[SHOULD-FIX] Missing CREATE TABLE statements** → Added full SQL to db.ts section.
5. **[SHOULD-FIX] `autoUpdate().readOnly()` redundant** → Removed `.readOnly()`.
6. **[SHOULD-FIX] `projectId` type** → Changed to `d.uuid()`.
7. **[SHOULD-FIX] `users.entity.ts` inconsistency** → Fixed (same as DX #5).
8. **[SHOULD-FIX] Form async initial** → Resolved (same as DX #3).
9. **[NIT] Timestamp SQLite storage** → Acknowledged (framework handles conversion).
10. **[NIT] `d.text()` vs `d.enum()`** → Kept `d.text()` (design decision documented).
11. **[NIT] `FormData` pseudo-code** → Fixed (same as DX #4).

### DX Re-Review (Josh) — Rev 2 → Rev 3
1. **[BLOCKER] `IssueDetailView` form pattern broken** — `.bind()` strips SDK properties; `submit()` without bound `<form>` is no-op → Replaced with direct SDK calls (`issueApi.update()`). Convention: `form()` for `<form>` elements, direct SDK for programmatic mutations.
2. **[SHOULD-FIX] Sidebar `project.data?.key`** → Fixed to `project.key` / `project.name`.
3. **[NIT] Missing `projectApi`/`issueApi` imports** → Acknowledged; codegen path noted in Unknown #3.

### Product/Scope Re-Review — Rev 2 → Rev 3
1. **[SHOULD-FIX] Sidebar `project.data?.key`** → Fixed (same as DX re-review #2).

### Technical Re-Review — Rev 2 → Rev 3
1. **[SHOULD-FIX] `number`/`createdBy` required in `$create_input`** → Marked both as `.readOnly()` in schema, excluding them from `$create_input`. `before.create` hook sets them server-side.
2. **[SHOULD-FIX] Sidebar `project.data?.key`** → Fixed (same as DX re-review #2).
