/**
 * Task API — entry point.
 *
 * A demo CRUD API built with the full vertz stack:
 * - @vertz/schema for request/response validation
 * - @vertz/core for the module system, routing, and HTTP server
 * - @vertz/db for the database schema and ORM
 *
 * Endpoints:
 *   GET    /api/users          — list users (pagination)
 *   POST   /api/users          — create a user
 *   GET    /api/users/:id      — get user by ID
 *   GET    /api/tasks          — list tasks (filterable by status, priority, assignee)
 *   POST   /api/tasks          — create a task
 *   GET    /api/tasks/:id      — get task with assignee included
 *   PATCH  /api/tasks/:id      — update a task
 *   DELETE /api/tasks/:id      — delete a task
 */
import { vertz } from '@vertz/core';
import { userModule } from './modules/users/user.module';
import { taskModule } from './modules/tasks/task.module';

const PORT = Number(process.env.PORT) || 3000;

const app = vertz
  .app({
    basePath: '/api',
    cors: { origins: true },
  })
  .register(userModule)
  .register(taskModule);

app.listen(PORT).then((handle) => {
  console.log(`Task API running at http://localhost:${handle.port}/api`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET    /api/users');
  console.log('  POST   /api/users');
  console.log('  GET    /api/users/:id');
  console.log('  GET    /api/tasks');
  console.log('  POST   /api/tasks');
  console.log('  GET    /api/tasks/:id');
  console.log('  PATCH  /api/tasks/:id');
  console.log('  DELETE /api/tasks/:id');
});
