import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { seedDatabase } from './seed';

function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys=ON');

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    priority TEXT NOT NULL DEFAULT 'none',
    assignee_id TEXT REFERENCES users(id),
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, number)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  return db;
}

describe('seedDatabase', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('Given a fresh database', () => {
    describe('When seedDatabase is called', () => {
      it('Then creates 2 seed users', () => {
        seedDatabase(db);
        const count = db.query('SELECT COUNT(*) as count FROM users').get() as { count: number };
        expect(count.count).toBe(2);
      });

      it('Then creates 3 seed projects with keys ENG, DES, DOC', () => {
        seedDatabase(db);
        const projects = db.query('SELECT key FROM projects ORDER BY key').all() as {
          key: string;
        }[];
        expect(projects.map((p) => p.key)).toEqual(['DES', 'DOC', 'ENG']);
      });

      it('Then creates 12 seed issues across projects', () => {
        seedDatabase(db);
        const count = db.query('SELECT COUNT(*) as count FROM issues').get() as { count: number };
        expect(count.count).toBe(12);
      });

      it('Then creates 6 issues for the Engineering project', () => {
        seedDatabase(db);
        const count = db
          .query('SELECT COUNT(*) as count FROM issues WHERE project_id = ?')
          .get('proj-eng') as { count: number };
        expect(count.count).toBe(6);
      });

      it('Then creates 10 seed comments across issues', () => {
        seedDatabase(db);
        const count = db.query('SELECT COUNT(*) as count FROM comments').get() as { count: number };
        expect(count.count).toBe(10);
      });

      it('Then seed comments have staggered timestamps', () => {
        seedDatabase(db);
        const timestamps = db
          .query('SELECT created_at FROM comments ORDER BY created_at')
          .all() as { created_at: string }[];
        // All timestamps should be different (staggered)
        const unique = new Set(timestamps.map((t) => t.created_at));
        expect(unique.size).toBe(10);
      });
    });
  });

  describe('Given a database with existing projects', () => {
    describe('When seedDatabase is called', () => {
      it('Then does not insert duplicate seed data', () => {
        seedDatabase(db);
        seedDatabase(db); // Call again

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
