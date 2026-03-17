import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@vertz/db';
import { unwrap } from '@vertz/schema';
import {
  commentsModel,
  issuesModel,
  projectsModel,
  SEED_WORKSPACE_ID,
  usersModel,
  workspacesModel,
} from './schema';
import { seedDatabase } from './seed';

describe('seedDatabase', () => {
  let client: ReturnType<typeof createClient>;
  let tmpDir: string;

  function createClient(dbPath: string) {
    return createDb({
      models: {
        workspaces: workspacesModel,
        users: usersModel,
        projects: projectsModel,
        issues: issuesModel,
        comments: commentsModel,
      },
      dialect: 'sqlite',
      path: dbPath,
      migrations: { autoApply: true },
    });
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'seed-test-'));
    const dbPath = join(tmpDir, 'test.db');

    client = createClient(dbPath);

    // Trigger lazy migration to create tables
    await client.projects.count();
  });

  afterEach(async () => {
    await client.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a fresh database', () => {
    describe('When seedDatabase is called', () => {
      it('Then creates the seed workspace record', async () => {
        await seedDatabase(client);
        const workspace = unwrap(await client.workspaces.get({ where: { id: SEED_WORKSPACE_ID } }));
        expect(workspace).toBeDefined();
        expect(workspace?.id).toBe(SEED_WORKSPACE_ID);
        expect(workspace?.name).toBe('Acme Corp');
      });

      it('Then creates 2 seed users', async () => {
        await seedDatabase(client);
        const count = unwrap(await client.users.count());
        expect(count).toBe(2);
      });

      it('Then creates 3 seed projects with keys ENG, DES, DOC', async () => {
        await seedDatabase(client);
        const projects = unwrap(
          await client.projects.list({ select: { key: true }, orderBy: { key: 'asc' } }),
        );
        expect(projects.map((p) => p.key)).toEqual(['DES', 'DOC', 'ENG']);
      });

      it('Then creates 12 seed issues across projects', async () => {
        await seedDatabase(client);
        const count = unwrap(await client.issues.count());
        expect(count).toBe(12);
      });

      it('Then creates 6 issues for the Engineering project', async () => {
        await seedDatabase(client);
        const count = unwrap(await client.issues.count({ where: { projectId: 'proj-eng' } }));
        expect(count).toBe(6);
      });

      it('Then creates 10 seed comments across issues', async () => {
        await seedDatabase(client);
        const count = unwrap(await client.comments.count());
        expect(count).toBe(10);
      });

      it('Then comments reference valid issues and authors', async () => {
        await seedDatabase(client);
        const comment = unwrap(await client.comments.get({ where: { id: 'com-1' } }));
        if (!comment) throw new Error('Expected comment com-1 to exist');
        expect(comment.body).toContain('CI is green');
        expect(comment.authorId).toBe('seed-bob');

        const issue = unwrap(await client.issues.get({ where: { id: comment.issueId } }));
        if (!issue) throw new Error('Expected issue to exist');
        expect(issue.title).toBe('Set up CI pipeline');
      });

      it('Then issues span all statuses', async () => {
        await seedDatabase(client);
        const issues = unwrap(
          await client.issues.list({ select: { status: true }, orderBy: { status: 'asc' } }),
        );
        const statuses = [...new Set(issues.map((i) => i.status))];
        expect(statuses).toEqual(['backlog', 'done', 'in_progress', 'todo']);
      });

      it('Then all seed records have timestamps', async () => {
        await seedDatabase(client);
        const users = unwrap(await client.users.list({ select: { createdAt: true } }));
        expect(users.every((u) => u.createdAt instanceof Date)).toBe(true);

        const projects = unwrap(await client.projects.list({ select: { createdAt: true } }));
        expect(projects.every((p) => p.createdAt instanceof Date)).toBe(true);

        const issues = unwrap(await client.issues.list({ select: { createdAt: true } }));
        expect(issues.every((i) => i.createdAt instanceof Date)).toBe(true);

        const comments = unwrap(await client.comments.list({ select: { createdAt: true } }));
        expect(comments.every((c) => c.createdAt instanceof Date)).toBe(true);
      });

      it('Then all seed records have the seed workspace ID as tenant_id', async () => {
        await seedDatabase(client);
        for (const countResult of [
          await client.users.count({ where: { tenantId: { ne: SEED_WORKSPACE_ID } } }),
          await client.projects.count({ where: { tenantId: { ne: SEED_WORKSPACE_ID } } }),
          await client.issues.count({ where: { tenantId: { ne: SEED_WORKSPACE_ID } } }),
          await client.comments.count({ where: { tenantId: { ne: SEED_WORKSPACE_ID } } }),
        ]) {
          expect(unwrap(countResult)).toBe(0);
        }
      });
    });
  });

  describe('Given a database with existing projects', () => {
    describe('When seedDatabase is called', () => {
      it('Then does not insert duplicate seed data', async () => {
        await seedDatabase(client);
        await seedDatabase(client); // Call again

        const projectCount = unwrap(await client.projects.count());
        const issueCount = unwrap(await client.issues.count());
        const commentCount = unwrap(await client.comments.count());

        expect(projectCount).toBe(3);
        expect(issueCount).toBe(12);
        expect(commentCount).toBe(10);
      });
    });
  });
});
