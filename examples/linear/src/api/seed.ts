/**
 * Seed data for the Linear clone.
 *
 * Populates the database with users, projects, issues, and comments
 * on first run so the app feels alive without manual data entry.
 *
 * Only seeds when the database is empty (no projects exist).
 */

import type { DatabaseClient } from '@vertz/db';
import { isOk, unwrap } from '@vertz/schema';
import {
  type commentsModel,
  type issuesModel,
  type projectsModel,
  SEED_TENANT_ID,
  type tenantsModel,
  type usersModel,
} from './schema';

type SeedModels = {
  tenants: typeof tenantsModel;
  users: typeof usersModel;
  projects: typeof projectsModel;
  issues: typeof issuesModel;
  comments: typeof commentsModel;
};

export async function seedDatabase(db: DatabaseClient<SeedModels>) {
  const result = await db.projects.count();
  if (isOk(result) && result.data > 0) return;

  const T = SEED_TENANT_ID;

  // --- Tenant ---
  unwrap(
    await db.tenants.create({
      data: { id: T, name: 'Acme Corp' },
    }),
  );

  // --- Users ---
  // Seed users are inserted directly for development.
  // In production, users are created via OAuth.
  // Seed IDs use 'seed-' prefix to distinguish from OAuth-created users.
  unwrap(
    await db.users.createMany({
      data: [
        {
          id: 'seed-alice',
          tenantId: T,
          name: 'Alice Chen',
          email: 'alice@example.com',
          avatarUrl: null,
        },
        {
          id: 'seed-bob',
          tenantId: T,
          name: 'Bob Martinez',
          email: 'bob@example.com',
          avatarUrl: null,
        },
      ],
    }),
  );

  // --- Projects ---
  unwrap(
    await db.projects.createMany({
      data: [
        {
          id: 'proj-eng',
          tenantId: T,
          name: 'Engineering',
          key: 'ENG',
          description: 'Core platform development',
          createdBy: 'seed-alice',
        },
        {
          id: 'proj-des',
          tenantId: T,
          name: 'Design',
          key: 'DES',
          description: 'Design system and UI work',
          createdBy: 'seed-alice',
        },
        {
          id: 'proj-doc',
          tenantId: T,
          name: 'Documentation',
          key: 'DOC',
          description: 'Docs, guides, and tutorials',
          createdBy: 'seed-bob',
        },
      ],
    }),
  );

  // --- Issues ---
  unwrap(
    await db.issues.createMany({
      data: [
        {
          id: 'iss-1',
          tenantId: T,
          projectId: 'proj-eng',
          number: 1,
          title: 'Set up CI pipeline',
          description: 'Configure GitHub Actions for build, test, and deploy.',
          status: 'done',
          priority: 'high',
          assigneeId: 'seed-bob',
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-2',
          tenantId: T,
          projectId: 'proj-eng',
          number: 2,
          title: 'Add database migrations',
          description: 'Implement migration system for schema changes.',
          status: 'in_progress',
          priority: 'high',
          assigneeId: 'seed-alice',
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-3',
          tenantId: T,
          projectId: 'proj-eng',
          number: 3,
          title: 'API rate limiting',
          description: 'Add rate limiting middleware to protect endpoints.',
          status: 'todo',
          priority: 'medium',
          assigneeId: null,
          createdBy: 'seed-bob',
        },
        {
          id: 'iss-4',
          tenantId: T,
          projectId: 'proj-eng',
          number: 4,
          title: 'Fix memory leak in query cache',
          description: 'Query cache grows unbounded under sustained load.',
          status: 'backlog',
          priority: 'urgent',
          assigneeId: 'seed-alice',
          createdBy: 'seed-bob',
        },
        {
          id: 'iss-5',
          tenantId: T,
          projectId: 'proj-eng',
          number: 5,
          title: 'Upgrade TypeScript to 5.5',
          description: null,
          status: 'backlog',
          priority: 'low',
          assigneeId: null,
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-6',
          tenantId: T,
          projectId: 'proj-eng',
          number: 6,
          title: 'Add error boundary components',
          description: 'Wrap route-level components in error boundaries.',
          status: 'todo',
          priority: 'medium',
          assigneeId: 'seed-bob',
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-7',
          tenantId: T,
          projectId: 'proj-des',
          number: 1,
          title: 'Create color token system',
          description: 'Define semantic color tokens for light and dark themes.',
          status: 'in_progress',
          priority: 'high',
          assigneeId: 'seed-alice',
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-8',
          tenantId: T,
          projectId: 'proj-des',
          number: 2,
          title: 'Design empty states',
          description: 'Create illustrations and copy for empty list/board views.',
          status: 'todo',
          priority: 'medium',
          assigneeId: null,
          createdBy: 'seed-bob',
        },
        {
          id: 'iss-9',
          tenantId: T,
          projectId: 'proj-des',
          number: 3,
          title: 'Audit accessibility',
          description: 'WCAG 2.1 AA audit on all interactive components.',
          status: 'backlog',
          priority: 'high',
          assigneeId: null,
          createdBy: 'seed-alice',
        },
        {
          id: 'iss-10',
          tenantId: T,
          projectId: 'proj-doc',
          number: 1,
          title: 'Write getting started guide',
          description: 'Step-by-step guide from install to first entity.',
          status: 'in_progress',
          priority: 'high',
          assigneeId: 'seed-bob',
          createdBy: 'seed-bob',
        },
        {
          id: 'iss-11',
          tenantId: T,
          projectId: 'proj-doc',
          number: 2,
          title: 'Document entity API',
          description: 'Reference docs for entity(), access rules, hooks.',
          status: 'todo',
          priority: 'medium',
          assigneeId: 'seed-alice',
          createdBy: 'seed-bob',
        },
        {
          id: 'iss-12',
          tenantId: T,
          projectId: 'proj-doc',
          number: 3,
          title: 'Add code examples',
          description: null,
          status: 'backlog',
          priority: 'low',
          assigneeId: null,
          createdBy: 'seed-alice',
        },
      ],
    }),
  );

  // --- Comments ---
  unwrap(
    await db.comments.createMany({
      data: [
        {
          id: 'com-1',
          tenantId: T,
          issueId: 'iss-1',
          body: 'CI is green on all branches. Merging the config PR now.',
          authorId: 'seed-bob',
        },
        {
          id: 'com-2',
          tenantId: T,
          issueId: 'iss-1',
          body: 'Confirmed — builds pass. Moving to done.',
          authorId: 'seed-alice',
        },
        {
          id: 'com-3',
          tenantId: T,
          issueId: 'iss-2',
          body: 'Started with drizzle-kit but hit issues with D1. Switching to manual SQL migrations.',
          authorId: 'seed-alice',
        },
        {
          id: 'com-4',
          tenantId: T,
          issueId: 'iss-4',
          body: "Reproduced with 10k sequential queries. The WeakRef cleanup isn't firing.",
          authorId: 'seed-bob',
        },
        {
          id: 'com-5',
          tenantId: T,
          issueId: 'iss-4',
          body: 'Root cause: the finalizer only runs on GC, which is lazy. Need explicit eviction.',
          authorId: 'seed-alice',
        },
        {
          id: 'com-6',
          tenantId: T,
          issueId: 'iss-7',
          body: 'First pass at tokens is up. Using oklch for perceptual uniformity.',
          authorId: 'seed-alice',
        },
        {
          id: 'com-7',
          tenantId: T,
          issueId: 'iss-10',
          body: 'Draft is ready for review. Covers install, first entity, and dev server.',
          authorId: 'seed-bob',
        },
        {
          id: 'com-8',
          tenantId: T,
          issueId: 'iss-3',
          body: 'Should we use a token bucket or sliding window? Token bucket is simpler.',
          authorId: 'seed-bob',
        },
        {
          id: 'com-9',
          tenantId: T,
          issueId: 'iss-6',
          body: 'The framework should provide ErrorBoundary as a primitive. Opened a separate issue.',
          authorId: 'seed-alice',
        },
        {
          id: 'com-10',
          tenantId: T,
          issueId: 'iss-2',
          body: 'Migration system working. Need to add rollback support before closing.',
          authorId: 'seed-alice',
        },
      ],
    }),
  );
}
