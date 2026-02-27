/**
 * Seed script for local development.
 *
 * Seeds the SQLite database with sample tasks so the app
 * isn't empty on first run.
 *
 * Usage: bun run seed
 */

import { createTasksDb } from './db';
import { tasks } from './entities';
import { createServer } from '@vertz/server';

const db = createTasksDb();

const app = createServer({
  basePath: '/api',
  entities: [tasks],
  db,
});

const seedTasks = [
  {
    title: 'Set up CI/CD pipeline',
    description:
      'Configure GitHub Actions for automated testing and deployment. Include lint, typecheck, and test stages.',
    status: 'done',
    priority: 'high',
  },
  {
    title: 'Implement user authentication',
    description:
      'Add JWT-based auth with login, register, and token refresh endpoints. Use bcrypt for password hashing.',
    status: 'in-progress',
    priority: 'urgent',
  },
  {
    title: 'Write API documentation',
    description:
      'Document all REST endpoints using OpenAPI spec. Include request/response examples and error codes.',
    status: 'todo',
    priority: 'medium',
  },
];

console.log('Seeding tasks...');

for (const task of seedTasks) {
  const response = await app.handler(
    new Request('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    }),
  );

  if (!response.ok) {
    console.error(`Failed to seed task "${task.title}":`, await response.text());
  } else {
    const data = await response.json();
    console.log(`  ✓ ${data.title}`);
  }
}

console.log('Done! Seeded', seedTasks.length, 'tasks.');
process.exit(0);
