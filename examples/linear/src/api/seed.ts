/**
 * Seed data for the Linear clone.
 *
 * Populates the database with users, projects, issues, and comments
 * on first run so the app feels alive without manual data entry.
 *
 * Only seeds when the database is empty (no projects exist).
 */

import type { Database } from 'bun:sqlite';

export function seedDatabase(sqlite: Database) {
  const projectCount = sqlite.query('SELECT COUNT(*) as count FROM projects').get() as {
    count: number;
  };
  if (projectCount.count > 0) return;

  // --- Users ---
  // Seed users are inserted directly for development.
  // In production, users are created via OAuth.
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
