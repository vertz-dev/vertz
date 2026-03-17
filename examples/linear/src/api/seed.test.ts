import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@vertz/db';
import { commentsModel, issuesModel, projectsModel, SEED_TENANT_ID, usersModel } from './schema';
import { seedDatabase } from './seed';

describe('seedDatabase', () => {
  let client: ReturnType<typeof createClient>;
  let db: Database;
  let tmpDir: string;

  function createClient(dbPath: string) {
    return createDb({
      models: {
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

    // Open raw bun:sqlite for verification queries
    db = new Database(dbPath);
    db.exec('PRAGMA foreign_keys=ON');
  });

  afterEach(async () => {
    db.close();
    await client.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a fresh database', () => {
    describe('When seedDatabase is called', () => {
      it('Then creates 2 seed users', async () => {
        await seedDatabase(client);
        const count = db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
        expect(count.count).toBe(2);
      });

      it('Then creates 3 seed projects with keys ENG, DES, DOC', async () => {
        await seedDatabase(client);
        const projects = db.query('SELECT key FROM projects ORDER BY key').all() as {
          key: string;
        }[];
        expect(projects.map((p) => p.key)).toEqual(['DES', 'DOC', 'ENG']);
      });

      it('Then creates 12 seed issues across projects', async () => {
        await seedDatabase(client);
        const count = db.query('SELECT COUNT(*) as count FROM issues').get() as { count: number };
        expect(count.count).toBe(12);
      });

      it('Then creates 6 issues for the Engineering project', async () => {
        await seedDatabase(client);
        const count = db
          .query('SELECT COUNT(*) as count FROM issues WHERE project_id = ?')
          .get('proj-eng') as { count: number };
        expect(count.count).toBe(6);
      });

      it('Then creates 10 seed comments across issues', async () => {
        await seedDatabase(client);
        const count = db.query('SELECT COUNT(*) as count FROM comments').get() as {
          count: number;
        };
        expect(count.count).toBe(10);
      });

      it('Then comments reference valid issues and authors', async () => {
        await seedDatabase(client);
        // Verify a specific comment's relationships
        const comment = db
          .query(
            `SELECT c.body, c.author_id, i.title as issue_title
             FROM comments c
             JOIN issues i ON c.issue_id = i.id
             WHERE c.id = 'com-1'`,
          )
          .get() as { body: string; author_id: string; issue_title: string };

        expect(comment.body).toContain('CI is green');
        expect(comment.author_id).toBe('seed-bob');
        expect(comment.issue_title).toBe('Set up CI pipeline');
      });

      it('Then issues span all statuses', async () => {
        await seedDatabase(client);
        const statuses = db.query('SELECT DISTINCT status FROM issues ORDER BY status').all() as {
          status: string;
        }[];
        expect(statuses.map((s) => s.status)).toEqual(['backlog', 'done', 'in_progress', 'todo']);
      });

      it('Then all seed records have timestamps', async () => {
        await seedDatabase(client);
        for (const table of ['users', 'projects', 'issues', 'comments']) {
          const rows = db
            .query(`SELECT created_at FROM ${table} WHERE created_at IS NULL`)
            .all() as { created_at: string }[];
          expect(rows).toHaveLength(0);
        }
      });

      it('Then all seed records have the seed tenant ID', async () => {
        await seedDatabase(client);

        for (const table of ['users', 'projects', 'issues', 'comments']) {
          const rows = db
            .query(`SELECT tenant_id FROM ${table} WHERE tenant_id != ?`)
            .all(SEED_TENANT_ID) as { tenant_id: string }[];
          expect(rows).toHaveLength(0);
        }
      });
    });
  });

  describe('Given a database with existing projects', () => {
    describe('When seedDatabase is called', () => {
      it('Then does not insert duplicate seed data', async () => {
        await seedDatabase(client);
        await seedDatabase(client); // Call again

        const projectCount = db.query('SELECT COUNT(*) as count FROM projects').get() as {
          count: number;
        };
        const issueCount = db.query('SELECT COUNT(*) as count FROM issues').get() as {
          count: number;
        };
        const commentCount = db.query('SELECT COUNT(*) as count FROM comments').get() as {
          count: number;
        };

        expect(projectCount.count).toBe(3);
        expect(issueCount.count).toBe(12);
        expect(commentCount.count).toBe(10);
      });
    });
  });
});
