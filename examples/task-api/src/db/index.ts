/**
 * Database instance — creates the typed database client.
 *
 * Uses PGlite in-memory by default for development/demo (no setup required).
 * Tables are auto-created on first use.
 * For production, set DATABASE_URL to a real PostgreSQL connection string.
 *
 * Usage:
 *   # Development/demo (in-memory, no setup)
 *   bun run dev
 *
 *   # Production (PostgreSQL)
 *   DATABASE_URL=postgres://user:pass@host:5432/db bun run dev
 */
import { createDb } from '@vertz/db';
import { tables } from './schema';
import { PGlite } from '@electric-sql/pglite';

const databaseUrl = process.env.DATABASE_URL ?? 'pglite://memory';
const isPglite = databaseUrl.startsWith('pglite://');

// Create PGlite instance if using in-memory database
let pg: PGlite | null = null;
if (isPglite) {
  pg = new PGlite();
}

export const db = createDb({
  url: databaseUrl,
  tables,
  casing: 'snake_case',
  // Provide custom query function for PGlite
  ...(isPglite && pg && {
    _queryFn: async <T>(sql: string, params: readonly unknown[]) => {
      const result = await pg!.query<T>(sql, params as unknown[]);
      return { rows: result.rows as readonly T[], rowCount: result.affectedRows ?? 0 };
    },
  }),
});

// Auto-initialize tables on first use (for in-memory PGlite)
let initialized = false;

export async function ensureTables() {
  if (initialized || !isPglite || !pg) return;
  
  console.log('Initializing database tables...');

  try {
    // Create enum types
    await pg.exec(`
      CREATE TYPE user_role AS ENUM ('admin', 'member');
      CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
      CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
    `);

    // Create users table
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role user_role DEFAULT 'member',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create tasks table
    await pg.exec(`
      CREATE TABLE tasks (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status task_status DEFAULT 'todo',
        priority task_priority DEFAULT 'medium',
        assignee_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed data
    await pg.query(
      `INSERT INTO users (id, email, name, role) VALUES 
       ($1, $2, $3, $4),
       ($5, $6, $7, $8),
       ($9, $10, $11, $12)`,
      [
        '00000000-0000-0000-0000-000000000001', 'alice@example.com', 'Alice Johnson', 'admin',
        '00000000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob Smith', 'member',
        '00000000-0000-0000-0000-000000000003', 'carol@example.com', 'Carol Williams', 'member',
      ]
    );

    await pg.query(
      `INSERT INTO tasks (id, title, description, status, priority, assignee_id) VALUES 
       ($1, $2, $3, $4, $5, $6),
       ($7, $8, $9, $10, $11, $12),
       ($13, $14, $15, $16, $17, $18),
       ($19, $20, $21, $22, $23, $24),
       ($25, $26, $27, $28, $29, $30),
       ($31, $32, $33, $34, $35, $36),
       ($37, $38, $39, $40, $41, $42)`,
      [
        '10000000-0000-0000-0000-000000000001', 'Set up project infrastructure', 'Initialize the monorepo, configure CI/CD, and set up the development environment.', 'done', 'high', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', 'Design the database schema', 'Define tables for users and tasks with appropriate relations and constraints.', 'done', 'high', '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000003', 'Implement user CRUD endpoints', 'Build list, create, and get-by-id endpoints for users.', 'in_progress', 'medium', '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000004', 'Implement task CRUD endpoints', 'Build list, create, update, get-by-id, and delete endpoints for tasks.', 'in_progress', 'medium', '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000005', 'Add filtering and pagination', 'Support filtering tasks by status, priority, and assignee. Add pagination to list endpoints.', 'todo', 'medium', '00000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000006', 'Write API documentation', 'Document all endpoints with request/response examples.', 'todo', 'low', null,
        '10000000-0000-0000-0000-000000000007', 'Fix urgent production bug', null, 'todo', 'urgent', '00000000-0000-0000-0000-000000000001',
      ]
    );

    console.log('✓ Database initialized with sample data\n');
  } catch (e) {
    console.error('Database initialization failed:', e);
    throw e;
  }

  initialized = true;
}

export { tables } from './schema';
