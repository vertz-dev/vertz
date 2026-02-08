import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationApp, type TestServer } from '../app/create-app';

const AUTH = { authorization: 'Bearer user-1' };

let server: TestServer;

beforeAll(() => {
  server = createIntegrationApp();
});

afterAll(() => {
  server.stop();
});

describe('Multi-module', () => {
  it('both /api/users and /api/todos prefixes respond', async () => {
    const usersRes = await server.fetch('/api/users', { headers: AUTH });
    expect(usersRes.status).toBe(200);

    const todosRes = await server.fetch('/api/todos', { headers: AUTH });
    expect(todosRes.status).toBe(200);
  });

  it('cross-module DI works (todo creation validates user exists via userService)', async () => {
    // Create a user
    const userRes = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'CrossModule', email: 'cross@test.com' }),
    });
    const user = await userRes.json();

    // Create a todo for that user — should succeed
    const todoRes = await server.fetch('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ title: 'Cross-module todo', userId: user.id }),
    });

    expect(todoRes.status).toBe(200);
    const todo = await todoRes.json();
    expect(todo.userId).toBe(user.id);
  });

  it('creating todo for non-existent user returns 404', async () => {
    const res = await server.fetch('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ title: 'Orphan todo', userId: 'nonexistent-user' }),
    });

    expect(res.status).toBe(404);
  });

  it('modules are isolated — /api/users routes do not appear under /api/todos', async () => {
    const res = await server.fetch('/api/todos/users', { headers: AUTH });

    // /api/todos/users should not match any route (no such pattern in todos router)
    expect(res.status).toBe(404);
  });
});
