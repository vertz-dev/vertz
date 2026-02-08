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

describe('Users CRUD', () => {
  let userId: string;

  it('creates a user with POST /api/users', async () => {
    const res = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Alice', email: 'alice@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.email).toBe('alice@test.com');
    expect(body.id).toBeTypeOf('string');
    userId = body.id;
  });

  it('lists users with GET /api/users', async () => {
    const res = await server.fetch('/api/users', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Alice');
  });

  it('gets user by ID with GET /api/users/:id', async () => {
    const res = await server.fetch(`/api/users/${userId}`, { headers: AUTH });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(userId);
    expect(body.name).toBe('Alice');
  });

  it('updates a user with PUT /api/users/:id', async () => {
    const res = await server.fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Alice Updated', email: 'alice-new@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(userId);
    expect(body.name).toBe('Alice Updated');
    expect(body.email).toBe('alice-new@test.com');
  });

  it('deletes a user with DELETE /api/users/:id', async () => {
    const res = await server.fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(204);
  });

  it('returns 404 after deleting a user', async () => {
    const res = await server.fetch(`/api/users/${userId}`, { headers: AUTH });

    expect(res.status).toBe(404);
  });
});

describe('Todos CRUD', () => {
  let todoUserId: string;
  let todoId: string;

  it('creates a user for todo tests', async () => {
    const res = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Bob', email: 'bob@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    todoUserId = body.id;
  });

  it('creates a todo with POST /api/todos', async () => {
    const res = await server.fetch('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ title: 'Write tests', userId: todoUserId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Write tests');
    expect(body.userId).toBe(todoUserId);
    expect(body.done).toBe(false);
    expect(body.id).toBeTypeOf('string');
    todoId = body.id;
  });

  it('lists todos with GET /api/todos', async () => {
    const res = await server.fetch('/api/todos', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('Write tests');
  });

  it('filters todos by userId with GET /api/todos?userId=...', async () => {
    const res = await server.fetch(`/api/todos?userId=${todoUserId}`, { headers: AUTH });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);

    const noMatch = await server.fetch('/api/todos?userId=nonexistent', { headers: AUTH });
    const emptyBody = await noMatch.json();
    expect(emptyBody).toHaveLength(0);
  });

  it('toggles todo completion with PATCH /api/todos/:id/complete', async () => {
    const res = await server.fetch(`/api/todos/${todoId}/complete`, {
      method: 'PATCH',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.done).toBe(true);

    // Toggle again
    const res2 = await server.fetch(`/api/todos/${todoId}/complete`, {
      method: 'PATCH',
      headers: AUTH,
    });
    const body2 = await res2.json();
    expect(body2.done).toBe(false);
  });

  it('deletes a todo with DELETE /api/todos/:id', async () => {
    const res = await server.fetch(`/api/todos/${todoId}`, {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(204);
  });
});
