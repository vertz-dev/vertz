import { createServer, type ServerHandle } from '@vertz/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMiddleware } from '../app/middleware/auth';
import { createTodosModule } from '../app/modules/todos';
import { createUsersModule } from '../app/modules/users';

const AUTH = { authorization: 'Bearer user-1' };

let handle: ServerHandle;
let baseUrl: string;

beforeAll(async () => {
  const { module: usersModule, userService } = createUsersModule();
  const { module: todosModule } = createTodosModule(userService);

  const app = createServer({ basePath: '/api', cors: { origins: true } })
    .middlewares([authMiddleware])
    .register(usersModule)
    .register(todosModule);

  handle = await app.listen(0);
  baseUrl = `http://${handle.hostname}:${handle.port}`;
});

afterAll(async () => {
  await handle.close();
});

describe('E2E listen', () => {
  it('responds to GET requests with JSON', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeInstanceOf(Array);
  });

  it('handles POST requests with JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Alice', email: 'alice@e2e.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.email).toBe('alice@e2e.com');
    expect(body.id).toBeTypeOf('string');
  });

  it('resolves route params in GET requests', async () => {
    // Create a user first
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Bob', email: 'bob@e2e.com' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/users/${created.id}`, {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Bob');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`, {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NotFound');
  });

  it('returns 401 when authorization header is missing', async () => {
    const res = await fetch(`${baseUrl}/api/users`);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UnauthorizedException');
  });

  it('handles CORS preflight with 204', async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'OPTIONS',
      headers: { origin: 'http://example.com' },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles DELETE requests and returns 204', async () => {
    // Create a user to delete
    const createRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'ToDelete', email: 'delete@e2e.com' }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/users/${created.id}`, {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(204);

    // Verify the user is gone
    const getRes = await fetch(`${baseUrl}/api/users/${created.id}`, {
      headers: AUTH,
    });
    expect(getRes.status).toBe(404);
  });
});
