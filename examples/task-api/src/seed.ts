/**
 * Seed script — populates the database with sample data.
 *
 * Usage:
 *   bun run seed
 *
 * Prerequisites:
 *   - A running PostgreSQL instance
 *   - DATABASE_URL environment variable set
 *   - Tables created (run migrations first)
 */
import { db } from './db';
import type { tasks, users } from './db/schema';

// ---------------------------------------------------------------------------
// Inferred insert types — validated at the definition site via `satisfies`.
// No `as const` needed on individual fields.
// ---------------------------------------------------------------------------

type UserInsert = typeof users.$insert;
type TaskInsert = typeof tasks.$insert;

const USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@example.com',
    name: 'Alice Johnson',
    role: 'admin',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@example.com',
    name: 'Bob Smith',
    role: 'member',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@example.com',
    name: 'Carol Williams',
    role: 'member',
  },
] satisfies UserInsert[];

const TASKS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    title: 'Set up project infrastructure',
    description:
      'Initialize the monorepo, configure CI/CD, and set up the development environment.',
    status: 'done',
    priority: 'high',
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    title: 'Design the database schema',
    description: 'Define tables for users and tasks with appropriate relations and constraints.',
    status: 'done',
    priority: 'high',
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    title: 'Implement user CRUD endpoints',
    description: 'Build list, create, and get-by-id endpoints for users.',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: '00000000-0000-0000-0000-000000000002',
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    title: 'Implement task CRUD endpoints',
    description: 'Build list, create, update, get-by-id, and delete endpoints for tasks.',
    status: 'in_progress',
    priority: 'medium',
    assigneeId: '00000000-0000-0000-0000-000000000002',
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    title: 'Add filtering and pagination',
    description:
      'Support filtering tasks by status, priority, and assignee. Add pagination to list endpoints.',
    status: 'todo',
    priority: 'medium',
    assigneeId: '00000000-0000-0000-0000-000000000003',
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    title: 'Write API documentation',
    description: 'Document all endpoints with request/response examples.',
    status: 'todo',
    priority: 'low',
    assigneeId: null,
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    title: 'Fix urgent production bug',
    description: null,
    status: 'todo',
    priority: 'urgent',
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
] satisfies TaskInsert[];

async function seed() {
  console.log('Seeding database...');

  // Insert users
  console.log(`  Creating ${USERS.length} users...`);
  for (const user of USERS) {
    await db.users.create({ data: user });
  }

  // Insert tasks
  console.log(`  Creating ${TASKS.length} tasks...`);
  for (const task of TASKS) {
    await db.tasks.create({
      data: {
        ...task,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  console.log('Done! Seeded:');
  console.log(`  - ${USERS.length} users`);
  console.log(`  - ${TASKS.length} tasks`);

  await db.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
