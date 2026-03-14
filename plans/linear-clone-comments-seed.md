# Linear Clone — Phase 2: Comments & Seed Data

> **Status:** Draft — Rev 2 (addressing DX, Product, Technical reviews)
> **Depends on:** Phase 1 (Projects & Issues) — complete
> **Example app:** `examples/linear/`

---

## Overview

Add **comments on issues** and **seed data** to the Linear clone. Comments add a new entity with a form-driven creation flow, author resolution, and a styled feed UI on the issue detail page. Seed data populates the database on first run so the app feels alive without manual data entry.

Together, these two features make the example app feel like a real product — you open it and see projects, issues, and conversations, not an empty shell.

---

## API Surface

### Database Schema

```ts
// src/api/schema.ts — additions
import { d } from '@vertz/db';

// ── Comments ─────────────────────────────────────────────────
export const commentsTable = d.table('comments', {
  id: d.uuid().primary({ generate: 'uuid' }),
  issueId: d.uuid(),                // FK → issues.id
  body: d.text(),
  authorId: d.text().default(''),   // set by before.create hook
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate(),
});

export const commentsModel = d.model(commentsTable);
```

**Design decisions:**
- `authorId` uses `.default('')` — matching the pattern established by `createdBy` in projects and issues entities. The `before.create` hook always overwrites this with `ctx.userId`. The `.default('')` approach was adopted during Phase 1 implementation instead of `.readOnly()` from the design doc. Ideally this would be `.readOnly()`, but consistency with the existing codebase takes priority.
- `updatedAt` with `.autoUpdate()` supports future edit functionality. Not exposed in the UI.
- No `editedAt` or `isEdited` flag — editing comments is a non-goal for this phase.

### Entity Definition

```ts
// src/api/entities/comments.entity.ts
import { entity, rules, UnauthorizedException } from '@vertz/server';
import { commentsModel } from '../schema';

export const comments = entity('comments', {
  model: commentsModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.all(rules.authenticated(), rules.where({ authorId: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ authorId: rules.user.id })),
  },
  before: {
    create: (data, ctx) => {
      if (!ctx.userId) throw new UnauthorizedException('Authenticated user required');
      return { ...data, authorId: ctx.userId };
    },
  },
});
```

**Design decisions:**
- Only the comment author can update/delete their own comments — consistent with projects/issues ownership pattern.
- `before.create` sets `authorId` server-side, same pattern as `createdBy` in projects/issues. This means even if a client sends a spoofed `authorId`, the hook overwrites it.
- `commentApi.delete` is defined in the SDK for future use, but no delete button is shown in the UI. This is consistent with the approach for issues (access rules defined, UI deferred pending access-rule-driven visibility).

### Server Registration

```ts
// src/api/server.ts — add comments entity
import { comments } from './entities/comments.entity';

export const app = createServer({
  // ...existing config...
  entities: [users, projects, issues, comments],
});
```

### Database Setup

```sql
-- Added to src/api/db.ts
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Design decisions:**
- `ON DELETE CASCADE` on `issue_id` — when an issue is deleted, its comments are automatically removed. Without this, deleting an issue with comments would fail with a FK constraint violation (since `PRAGMA foreign_keys=ON` is set in db.ts).
- `author_id` does NOT cascade on user delete — deleting a user while their comments exist should fail explicitly. Orphaned comments with no author would be confusing.

### Client SDK

```ts
// src/api/client.ts — additions
import type { Comment, CreateCommentBody } from '../lib/types';

export const commentApi = {
  list: Object.assign(
    (issueId: string) =>
      createDescriptor<ListResponse<Comment>>('GET', `/comments?issueId=${issueId}`, () =>
        fetchJson<ListResponse<Comment>>('GET', `/comments?issueId=${issueId}`),
      ),
    { url: '/api/comments', method: 'GET' as const },
  ),

  create: Object.assign(
    async (body: CreateCommentBody) => {
      const res = await fetchJson<Comment>('POST', '/comments', body);
      if (!res.ok) return res;
      return ok(res.data.data);
    },
    { url: '/api/comments', method: 'POST' as const },
  ),

  delete: async (id: string) => {
    const res = await fetchJson<void>('DELETE', `/comments/${id}`);
    if (!res.ok) return res;
    return ok(undefined);
  },
};
```

### Types

```ts
// src/lib/types.ts — additions

export interface Comment {
  id: string;
  issueId: string;
  body: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentBody {
  issueId: string;
  body: string;
}
```

### Issue Detail Page — Updated with Comments

```tsx
// src/pages/issue-detail-page.tsx — updated
export function IssueDetailPage() {
  const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
  const issue = query(issueApi.get(issueId));
  const project = query(projectApi.get(projectId));
  const comments = query(commentApi.list(issueId));
  const users = query(userApi.list());

  // Build user lookup map for author resolution
  const userMap: Record<string, { name: string; avatarUrl: string | null }> = {};
  if (users.data?.items) {
    for (const u of users.data.items) {
      userMap[u.id] = { name: u.name, avatarUrl: u.avatarUrl };
    }
  }

  // ... existing status/priority handlers ...

  return (
    <div class={styles.container}>
      {issue.data && (
        <div class={styles.layout}>
          <div class={styles.main}>
            {/* ... existing issue header/description ... */}

            <CommentSection
              comments={comments.data?.items ?? []}
              loading={comments.loading}
              issueId={issueId}
              userMap={userMap}
              onCommentAdded={() => comments.refetch()}
            />
          </div>

          <aside class={styles.sidebar}>
            {/* ... existing status/priority selects ... */}
          </aside>
        </div>
      )}
    </div>
  );
}
```

**Design decision:** Author resolution is done client-side by fetching the users list and building a lookup map. This is a pragmatic choice since the manual SDK doesn't support relation-based includes (`?include=author`). With codegen and deep normalization, the server would return `comment.author` as a nested object and the entity store would resolve it automatically. The client-side lookup achieves the same result for the example app.

### Comment Section Component

```tsx
// src/components/comment-section.tsx
import type { FormSchema } from '@vertz/ui';
import { css, form } from '@vertz/ui';
import { commentApi } from '../api/client';
import type { Comment, CreateCommentBody } from '../lib/types';
import { CommentItem } from './comment-item';

// --- Validation schema ---
const createCommentSchema: FormSchema<CreateCommentBody> = {
  parse(data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return { ok: false as const, error: new Error('Invalid form data') };
    }
    const obj = data as Record<string, unknown>;
    const errors: Record<string, string> = {};

    if (!obj.body || typeof obj.body !== 'string' || obj.body.trim().length === 0) {
      errors.body = 'Comment cannot be empty';
    }

    if (Object.keys(errors).length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
      return { ok: false as const, error: err };
    }

    return {
      ok: true as const,
      data: {
        issueId: obj.issueId as string,
        body: (obj.body as string).trim(),
      },
    };
  },
};

interface CommentSectionProps {
  comments: Comment[];
  loading: boolean;
  issueId: string;
  userMap: Record<string, { name: string; avatarUrl: string | null }>;
  onCommentAdded: () => void;
}

export function CommentSection({ comments, loading, issueId, userMap, onCommentAdded }: CommentSectionProps) {
  const commentForm = form(commentApi.create, {
    schema: createCommentSchema,
    initial: { issueId, body: '' },
    onSuccess: onCommentAdded,
  });

  return (
    <div class={styles.section}>
      <h3 class={styles.heading}>Comments</h3>

      {loading && <div class={styles.loading}>Loading comments...</div>}

      {!loading && comments.length === 0 && (
        <div class={styles.empty}>No comments yet.</div>
      )}

      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          authorName={userMap[comment.authorId]?.name ?? 'Unknown'}
          authorAvatarUrl={userMap[comment.authorId]?.avatarUrl ?? null}
        />
      ))}

      <form
        action={commentForm.action}
        method={commentForm.method}
        onSubmit={commentForm.onSubmit}
        class={styles.form}
      >
        <textarea
          name="body"
          placeholder="Add a comment..."
          class={styles.textarea}
        />
        {commentForm.body.error && (
          <span class={styles.error}>{commentForm.body.error}</span>
        )}
        <input type="hidden" name="issueId" value={issueId} />
        <button type="submit" disabled={commentForm.submitting} class={styles.submit}>
          {commentForm.submitting ? 'Posting...' : 'Comment'}
        </button>
      </form>
    </div>
  );
}
```

**Design decisions:**
- `createCommentSchema` follows the exact pattern from `CreateProjectDialog` and `CreateIssueDialog` — explicit `FormSchema<T>` with a `parse()` method that returns field-level errors.
- The hidden `issueId` input + `initial: { issueId }` is the established belt-and-suspenders pattern (hidden field for progressive enhancement, initial value for the form instance), matching `CreateIssueDialog`'s `projectId` handling.

### Comment Item Component

```tsx
// src/components/comment-item.tsx
import { css } from '@vertz/ui';
import type { Comment } from '../lib/types';

interface CommentItemProps {
  comment: Comment;
  authorName: string;
  authorAvatarUrl: string | null;
}

export function CommentItem({ comment, authorName, authorAvatarUrl }: CommentItemProps) {
  return (
    <div class={styles.comment}>
      <div class={styles.header}>
        {authorAvatarUrl && (
          <img class={styles.avatar} src={authorAvatarUrl} alt="" />
        )}
        <span class={styles.author}>{authorName}</span>
        <span class={styles.date}>
          {formatRelativeTime(comment.createdAt)}
        </span>
      </div>
      <p class={styles.body}>{comment.body}</p>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
```

**Design decisions:**
- `CommentItem` receives resolved `authorName` and `authorAvatarUrl` as props rather than taking a `userMap` — keeps the component simple and reusable.
- `formatRelativeTime()` provides human-readable timestamps ("2h ago", "3d ago") rather than raw ISO dates. This makes the comment feed feel more natural.
- Author avatar is shown when available, omitted otherwise (seed users have no avatars, OAuth users will have their GitHub avatar).

### User API Addition

```ts
// src/api/client.ts — add to existing userApi or create if missing

export const userApi = {
  list: Object.assign(
    () =>
      createDescriptor<ListResponse<User>>('GET', '/users', () =>
        fetchJson<ListResponse<User>>('GET', '/users'),
      ),
    { url: '/api/users', method: 'GET' as const },
  ),
};
```

**Note:** The users entity already exists with `list: rules.authenticated()`. We just need a client SDK method to fetch users for the lookup map.

### Seed Data

```ts
// src/api/seed.ts
import type { Database } from 'bun:sqlite';

export function seedDatabase(sqlite: Database) {
  // Check if data already exists — only seed on empty database
  const projectCount = sqlite.query('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  if (projectCount.count > 0) return;

  // --- Users ---
  // Note: Users are created via OAuth in production. Seed users are inserted
  // directly for development so the app has data without requiring GitHub login.
  // Seed IDs use 'seed-' prefix to distinguish from OAuth-created users.
  sqlite.exec(`INSERT INTO users (id, name, email, avatar_url) VALUES
    ('seed-alice', 'Alice Chen', 'alice@example.com', NULL),
    ('seed-bob', 'Bob Martinez', 'bob@example.com', NULL)
  `);

  // --- Projects ---
  sqlite.exec(`INSERT INTO projects (id, name, key, description, created_by, created_at) VALUES
    ('proj-eng', 'Engineering', 'ENG', 'Core platform development', 'seed-alice', '2026-02-15 09:00:00'),
    ('proj-des', 'Design', 'DES', 'Design system and UI work', 'seed-alice', '2026-02-16 10:30:00'),
    ('proj-doc', 'Documentation', 'DOC', 'Docs, guides, and tutorials', 'seed-bob', '2026-02-18 14:00:00')
  `);

  // --- Issues ---
  // Spread across statuses (done, in_progress, todo, backlog) and priorities (urgent through low)
  sqlite.exec(`INSERT INTO issues (id, project_id, number, title, description, status, priority, assignee_id, created_by, created_at) VALUES
    ('iss-1', 'proj-eng', 1, 'Set up CI pipeline', 'Configure GitHub Actions for build, test, and deploy.', 'done', 'high', 'seed-bob', 'seed-alice', '2026-02-20 09:15:00'),
    ('iss-2', 'proj-eng', 2, 'Add database migrations', 'Implement migration system for schema changes.', 'in_progress', 'high', 'seed-alice', 'seed-alice', '2026-02-21 11:00:00'),
    ('iss-3', 'proj-eng', 3, 'API rate limiting', 'Add rate limiting middleware to protect endpoints.', 'todo', 'medium', NULL, 'seed-bob', '2026-02-22 14:30:00'),
    ('iss-4', 'proj-eng', 4, 'Fix memory leak in query cache', 'Query cache grows unbounded under sustained load.', 'backlog', 'urgent', 'seed-alice', 'seed-bob', '2026-02-24 10:00:00'),
    ('iss-5', 'proj-eng', 5, 'Upgrade TypeScript to 5.5', NULL, 'backlog', 'low', NULL, 'seed-alice', '2026-02-25 16:00:00'),
    ('iss-6', 'proj-eng', 6, 'Add error boundary components', 'Wrap route-level components in error boundaries.', 'todo', 'medium', 'seed-bob', 'seed-alice', '2026-02-26 09:30:00'),
    ('iss-7', 'proj-des', 1, 'Create color token system', 'Define semantic color tokens for light and dark themes.', 'in_progress', 'high', 'seed-alice', 'seed-alice', '2026-02-20 10:00:00'),
    ('iss-8', 'proj-des', 2, 'Design empty states', 'Create illustrations and copy for empty list/board views.', 'todo', 'medium', NULL, 'seed-bob', '2026-02-23 13:00:00'),
    ('iss-9', 'proj-des', 3, 'Audit accessibility', 'WCAG 2.1 AA audit on all interactive components.', 'backlog', 'high', NULL, 'seed-alice', '2026-02-27 11:30:00'),
    ('iss-10', 'proj-doc', 1, 'Write getting started guide', 'Step-by-step guide from install to first entity.', 'in_progress', 'high', 'seed-bob', 'seed-bob', '2026-02-19 09:00:00'),
    ('iss-11', 'proj-doc', 2, 'Document entity API', 'Reference docs for entity(), access rules, hooks.', 'todo', 'medium', 'seed-alice', 'seed-bob', '2026-02-22 10:00:00'),
    ('iss-12', 'proj-doc', 3, 'Add code examples', NULL, 'backlog', 'low', NULL, 'seed-alice', '2026-02-28 15:00:00')
  `);

  // --- Comments ---
  // Staggered timestamps so the comment feed looks realistic
  sqlite.exec(`INSERT INTO comments (id, issue_id, body, author_id, created_at) VALUES
    ('com-1', 'iss-1', 'CI is green on all branches. Merging the config PR now.', 'seed-bob', '2026-02-21 10:30:00'),
    ('com-2', 'iss-1', 'Confirmed — builds pass. Moving to done.', 'seed-alice', '2026-02-21 14:15:00'),
    ('com-3', 'iss-2', 'Started with drizzle-kit but hit issues with D1. Switching to manual SQL migrations.', 'seed-alice', '2026-02-22 09:00:00'),
    ('com-4', 'iss-4', 'Reproduced with 10k sequential queries. The WeakRef cleanup isn''t firing.', 'seed-bob', '2026-02-25 11:00:00'),
    ('com-5', 'iss-4', 'Root cause: the finalizer only runs on GC, which is lazy. Need explicit eviction.', 'seed-alice', '2026-02-25 15:30:00'),
    ('com-6', 'iss-7', 'First pass at tokens is up. Using oklch for perceptual uniformity.', 'seed-alice', '2026-02-22 16:00:00'),
    ('com-7', 'iss-10', 'Draft is ready for review. Covers install, first entity, and dev server.', 'seed-bob', '2026-02-24 09:45:00'),
    ('com-8', 'iss-3', 'Should we use a token bucket or sliding window? Token bucket is simpler.', 'seed-bob', '2026-02-23 10:00:00'),
    ('com-9', 'iss-6', 'The framework should provide ErrorBoundary as a primitive. Opened a separate issue.', 'seed-alice', '2026-02-27 14:00:00'),
    ('com-10', 'iss-2', 'Migration system working. Need to add rollback support before closing.', 'seed-alice', '2026-03-01 11:30:00')
  `);
}
```

**Design decisions:**
- Seed checks `SELECT COUNT(*) FROM projects` — only seeds on empty database. If a user creates a project through the UI before restarting, seed is skipped.
- Seed users have `seed-` prefix IDs to distinguish from OAuth-created users. These IDs are not UUIDs (unlike real entities), making them easy to identify in the database.
- Seed users don't have avatar URLs — intentional since they didn't come through GitHub OAuth. The `CommentItem` gracefully handles missing avatars.
- All seed data includes explicit `created_at` timestamps staggered across Feb-March 2026 so the app displays realistic relative times and chronological ordering.
- 3 projects, 12 issues across statuses/priorities, 10 comments — enough to feel alive.
- Comments use proper SQL escaping for apostrophes (`isn''t`).

### Seed Integration

```ts
// src/api/db.ts — add seed call after table creation
import { seedDatabase } from './seed';

// Inside createBunD1(), after all CREATE TABLE statements:
seedDatabase(sqlite);
```

---

## Manifesto Alignment

### Principles Applied

1. **If it builds, it works** — Comments follow the same entity pattern as projects/issues. Schema → entity → SDK → UI. No new patterns introduced.
2. **One way to do things** — Comment form uses `form()` with `FormSchema` for submission, consistent with create project/issue dialogs. Author resolution uses `query()` + lookup map. The seed script uses direct SQL, which is the appropriate tool for bootstrap data.
3. **If you can't demo it, it's not done** — Seed data makes the app demo-ready on first start. Comments with resolved author names and avatars make the issue detail page feel like a real collaboration tool.

### Tradeoffs

- **Client-side author resolution vs. relation-based includes** — The manual SDK doesn't support `?include=author`. With codegen and deep normalization, comments would include author data automatically. For the example, we fetch the users list separately and build a lookup map. This is pragmatic and demonstrates the `query()` pattern with multiple data sources.
- **No comment editing or deletion in UI** — Access rules define update/delete permissions, but no edit/delete buttons. Consistent with the approach for issues (access rules defined, UI deferred pending access-rule-driven visibility).
- **Seed users bypass OAuth** — Inserted directly into the users table. They can't log in via GitHub OAuth. They exist to make the seed data self-referential.

### What Was Rejected

- **Threaded/nested comments** — Adds recursive rendering complexity. Linear itself uses flat comments.
- **Rich text / markdown in comments** — Out of scope. Plain text is sufficient for the example.
- **Reactions on comments** — Nice-to-have for a Linear clone but adds a new entity pattern (many-to-many) better suited for the labels phase.
- **Activity log mixing comments with status changes** — Linear shows both in one timeline. This requires a polymorphic feed, which is complex. Deferred.
- **Deep normalization for author resolution** — The original `linear-clone.md` envisioned `commentsModel` with `d.ref.one(() => usersTable, 'authorId')` relation, enabling deep normalization. The manual SDK doesn't support this. When codegen lands, the example should be updated to use relation-based includes.

---

## Non-Goals

- **Comment editing UI** — Access rules support it; UI is deferred.
- **Comment deletion UI** — Same. SDK method `commentApi.delete` is defined for future use.
- **@mentions in comments** — Would require user search/autocomplete. Out of scope.
- **File attachments** — Would require blob storage. Out of scope.
- **Real-time comment updates** — No WebSocket push. Manual refetch only.
- **Comment pagination** — All comments loaded at once. Acceptable for an example app with ~10 seed comments per issue.
- **Seed data configuration** — No environment variable or flag to skip seeding. Always seeds on empty DB.
- **`ListTransition` on comment feed** — Would demonstrate animation on comment list changes. Deferred — can be added as a polish item later.

---

## Unknowns

1. **`form()` reset after submission** — After a comment is submitted successfully, the textarea should clear. Need to verify that `form()` resets field values after `onSuccess` fires. If not, the textarea will retain the submitted text. **Resolution:** Test during implementation. If `form()` doesn't auto-reset, manually clear via DOM reference or re-render the form component.

2. **Comment ordering** — The `commentApi.list()` call should return comments in chronological order (oldest first). Need to verify that the entity `list` endpoint's default order is by `createdAt ASC`. **Resolution:** Test during implementation. If default order is not chronological, add `?orderBy=createdAt:asc` to the query.

---

## POC Results

No POC needed. The comments entity follows the exact same pattern as projects and issues — `entity()` + `rules.*` access + `before.create` hook + manual SDK. Author resolution uses `query()` for users + a lookup map. Seed data is plain SQL inserts.

---

## Type Flow Map

```
commentsTable (d.table)
  → commentsModel (d.model) → infers $create_input (issueId, body), $response
    → entity('comments', { model }) → generates REST endpoints
      → commentApi.list(issueId): QueryDescriptor<ListResponse<Comment>>
        → query(commentApi.list(issueId)) → QueryResult<ListResponse<Comment>>
          → userMap[comment.authorId] → { name, avatarUrl }
            → JSX: {comments.map((c) => <CommentItem comment={c} authorName={...} />)}
      → commentApi.create(body): Promise<Result<Comment>>
        → createCommentSchema: FormSchema<CreateCommentBody>
          → form(commentApi.create, { schema }) → FormInstance<CreateCommentBody>
            → JSX: <textarea name="body" /> + {commentForm.body.error}

usersTable (existing)
  → userApi.list(): QueryDescriptor<ListResponse<User>>
    → query(userApi.list()) → QueryResult<ListResponse<User>>
      → userMap: Record<string, { name, avatarUrl }>
```

No dead generics. Every type flows from schema to UI. The `FormSchema` validation layer bridges the gap between raw FormData and typed `CreateCommentBody`.

---

## E2E Acceptance Test

```ts
describe('Feature: Comments on Issues', () => {
  // ── Seed Data ─────────────────────────────────────────────

  describe('Given a fresh database (first run)', () => {
    describe('When the server starts', () => {
      it('Then creates 2 seed users', () => {});
      it('Then creates 3 seed projects with keys ENG, DES, DOC', () => {});
      it('Then creates 12 seed issues across projects and statuses', () => {});
      it('Then creates 10 seed comments across issues', () => {});
    });
  });

  describe('Given a database with existing data', () => {
    describe('When the server starts', () => {
      it('Then does not duplicate seed data', () => {});
    });
  });

  // ── Comment Feed ──────────────────────────────────────────

  describe('Given an issue with existing comments (seed data)', () => {
    describe('When navigating to the issue detail page', () => {
      it('Then shows a "Comments" section below the issue description', () => {});
      it('Then displays each comment with author name and timestamp', () => {});
      it('Then shows author avatar when available', () => {});
      it('Then timestamps are human-readable (e.g., "2h ago")', () => {});
      it('Then comments are in chronological order (oldest first)', () => {});
    });
  });

  describe('Given an issue with no comments', () => {
    describe('When navigating to the issue detail page', () => {
      it('Then shows "No comments yet." empty state', () => {});
      it('Then the comment form is still visible', () => {});
    });
  });

  // ── Adding Comments ───────────────────────────────────────

  describe('Given an authenticated user on an issue detail page', () => {
    describe('When typing a comment and clicking "Comment"', () => {
      it('Then the comment appears in the feed', () => {});
      it('Then the textarea is cleared', () => {});
      it('Then the new comment shows the current user as author', () => {});
    });

    describe('When submitting an empty comment', () => {
      it('Then shows validation error "Comment cannot be empty"', () => {});
      it('Then does not create a comment', () => {});
    });
  });

  // ── Access Rules ──────────────────────────────────────────

  describe('Given an unauthenticated user', () => {
    describe('When accessing /api/comments', () => {
      it('Then returns 401 Unauthorized', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Seed Data

**Goal:** The app starts with realistic data on first run. This comes first so subsequent phases can test against real data without manual entry.

**Backend:**
- Add `CREATE TABLE IF NOT EXISTS comments` to `src/api/db.ts` (table must exist before seed runs)
- Create `src/api/seed.ts` with `seedDatabase()` function
- Call `seedDatabase()` from `src/api/db.ts` after table creation
- Seed: 2 users, 3 projects, 12 issues, 10 comments with staggered timestamps

**Acceptance criteria:**
```ts
describe('Given a fresh database', () => {
  describe('When the server starts', () => {
    it('Then /api/projects returns 3 projects', () => {});
    it('Then /api/issues?projectId=proj-eng returns 6 issues', () => {});
  });
});
describe('Given a database with existing projects', () => {
  describe('When the server starts', () => {
    it('Then does not insert duplicate seed data', () => {});
  });
});
```

### Phase 2: Comments Entity + Feed UI with Author Resolution

**Goal:** Users can view and add comments on issues. Comment feed displays author names and avatars. Styled to match the app's dark theme.

**Backend:**
- Add `commentsTable` and `commentsModel` to `src/api/schema.ts`
- Register `commentsModel` in `createDb({ models: { ... } })`
- Create `src/api/entities/comments.entity.ts` with access rules and `before.create` hook
- Register `comments` entity in `src/api/server.ts`

**Client SDK:**
- Add `Comment` and `CreateCommentBody` types to `src/lib/types.ts`
- Add `commentApi` (list, create, delete) to `src/api/client.ts`
- Add `userApi.list()` to `src/api/client.ts` (for author resolution)

**Frontend:**
- Create `src/components/comment-section.tsx` — comment feed + form with `FormSchema` validation
- Create `src/components/comment-item.tsx` — single comment with resolved author name/avatar and relative timestamps
- Update `src/pages/issue-detail-page.tsx` — fetch users, build lookup map, integrate `CommentSection` below issue content

**Acceptance criteria:**
```ts
describe('Given an authenticated user on an issue detail page', () => {
  describe('When the page loads', () => {
    it('Then shows a "Comments" section below the description', () => {});
    it('Then shows a comment form with textarea and submit button', () => {});
  });
  describe('When an issue has seed comments', () => {
    it('Then displays comments with author names (not authorId)', () => {});
    it('Then displays relative timestamps', () => {});
    it('Then comments are in chronological order', () => {});
  });
  describe('When an issue has no comments', () => {
    it('Then shows "No comments yet." empty state', () => {});
  });
  describe('When adding a comment with body text', () => {
    it('Then the comment appears in the feed after submission', () => {});
    it('Then the new comment shows the current user as author', () => {});
  });
  describe('When submitting an empty comment', () => {
    it('Then shows validation error "Comment cannot be empty"', () => {});
  });
});
```

---

## Review Resolution Log

### DX Review (Josh) — Rev 1 → Rev 2
1. **[BLOCKER] `form()` missing `schema` property** → Added `createCommentSchema: FormSchema<CreateCommentBody>` with `parse()` method, matching `CreateProjectDialog`/`CreateIssueDialog` pattern. Added `FormSchema` import.
2. **[BLOCKER] Missing `FormSchema` import** → Added `import type { FormSchema } from '@vertz/ui'` to `CommentSection`.
3. **[SHOULD-FIX] Raw `authorId` shown in Phase 1** → Merged Phase 1 and Phase 2. Comments now ship with author resolution from the start. `CommentItem` receives `authorName` and `authorAvatarUrl` as props. Issue detail page fetches users list and builds lookup map.
4. **[SHOULD-FIX] Seed timestamps all identical** → Added explicit `created_at` timestamps staggered across Feb-March 2026 for all seed data (projects, issues, comments).
5. **[SHOULD-FIX] `CommentSection` structure vs. original design** → Acknowledged as deliberate simplification. The original `linear-clone.md` listed `comment-form.tsx` and `comment-item.tsx` separately. This design uses `comment-section.tsx` (containing the form) + `comment-item.tsx` because the form is tightly coupled to the feed (onSuccess triggers refetch).
6. **[SHOULD-FIX] No client-side validation without schema** → Fixed by adding `createCommentSchema` (same as #1).
7. **[NIT] `CommentWithAuthor` unused** → Removed. Author data is now passed as separate props (`authorName`, `authorAvatarUrl`) rather than creating a merged type.
8. **[NIT] Phase numbering confusion** → Simplified to 2 phases: "Phase 1: Seed Data" and "Phase 2: Comments Entity + Feed UI with Author Resolution".

### Product/Scope Review — Rev 1 → Rev 2
1. **[SHOULD-FIX] Phase 1/2 split is artificial** → Merged. Comments now ship complete with author resolution.
2. **[SHOULD-FIX] Seed timestamps identical** → Fixed with staggered timestamps (same as DX #4).
3. **[SHOULD-FIX] Phase ordering** → Reordered. Seed data is now Phase 1 (comes first) so the comments phase can test against real data.
4. **[NIT] Three phases over-phased** → Reduced to 2 phases.
5. **[NIT] `commentApi.delete` in SDK but no UI** → Added rationale note in Entity Definition section.
6. **[NIT] Seed IDs not UUIDs** → Acknowledged in design decisions. Intentionally human-readable for debugging.
7. **[NIT] Gap vs. original vision** → Added note in "What Was Rejected" about deep normalization and `ListTransition` deferral.

### Technical Review — Rev 1 → Rev 2
1. **[BLOCKER] Schema uses `.readOnly()` but codebase uses `.default('')`** → Changed to `d.text().default('')` matching existing `createdBy` pattern. Added note explaining the discrepancy.
2. **[SHOULD-FIX] No `ON DELETE CASCADE`** → Added `ON DELETE CASCADE` on `issue_id` FK. Added design decision note explaining why `author_id` does NOT cascade.
3. **[SHOULD-FIX] Seed timestamps identical** → Fixed (same as DX #4).
4. **[SHOULD-FIX] Seed issues/projects also identical timestamps** → Fixed. All seed entities now have explicit `created_at` values.
5. **[NIT] "isnt" avoids SQL escaping** → Fixed to `isn''t` with proper SQL escaping.
