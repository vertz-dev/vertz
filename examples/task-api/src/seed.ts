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

const USERS = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'alice@example.com', name: 'Alice Johnson', role: 'admin' as const },
  { id: '00000000-0000-0000-0000-000000000002', email: 'bob@example.com', name: 'Bob Smith', role: 'member' as const },
  { id: '00000000-0000-0000-0000-000000000003', email: 'carol@example.com', name: 'Carol Williams', role: 'member' as const },
];

const TASKS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    title: 'Set up project infrastructure',
    description: 'Initialize the monorepo, configure CI/CD, and set up the development environment.',
    status: 'done' as const,
    priority: 'high' as const,
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    title: 'Design the database schema',
    description: 'Define tables for users and tasks with appropriate relations and constraints.',
    status: 'done' as const,
    priority: 'high' as const,
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    title: 'Implement user CRUD endpoints',
    description: 'Build list, create, and get-by-id endpoints for users.',
    status: 'in_progress' as const,
    priority: 'medium' as const,
    assigneeId: '00000000-0000-0000-0000-000000000002',
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    title: 'Implement task CRUD endpoints',
    description: 'Build list, create, update, get-by-id, and delete endpoints for tasks.',
    status: 'in_progress' as const,
    priority: 'medium' as const,
    assigneeId: '00000000-0000-0000-0000-000000000002',
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    title: 'Add filtering and pagination',
    description: 'Support filtering tasks by status, priority, and assignee. Add pagination to list endpoints.',
    status: 'todo' as const,
    priority: 'medium' as const,
    assigneeId: '00000000-0000-0000-0000-000000000003',
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    title: 'Write API documentation',
    description: 'Document all endpoints with request/response examples.',
    status: 'todo' as const,
    priority: 'low' as const,
    assigneeId: null,
  },
  {
    id: '10000000-0000-0000-0000-000000000007',
    title: 'Fix urgent production bug',
    description: null,
    status: 'todo' as const,
    priority: 'urgent' as const,
    assigneeId: '00000000-0000-0000-0000-000000000001',
  },
];

async function seed() {
  console.log('Seeding database...');

  // Insert users
  console.log(`  Creating ${USERS.length} users...`);
  for (const user of USERS) {
    await db.create('users', { data: user });
  }

  // Insert tasks
  console.log(`  Creating ${TASKS.length} tasks...`);
  for (const task of TASKS) {
    await db.create('tasks', {
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
