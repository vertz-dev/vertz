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

describe('Body validation', () => {
  it('rejects POST /api/users with missing name', async () => {
    const res = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ email: 'alice@test.com' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects POST /api/users with invalid email', async () => {
    const res = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Alice', email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects POST /api/todos with missing title', async () => {
    const res = await server.fetch('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ userId: 'some-id' }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts valid body and returns created resource', async () => {
    const res = await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'Valid User', email: 'valid@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Valid User');
  });
});

describe('Params validation', () => {
  it('validates params schema on GET /api/users/:id', async () => {
    const res = await server.fetch('/api/users/nonexistent-id', { headers: AUTH });

    // The params schema passes (id is a string), but the service throws NotFoundException
    expect(res.status).toBe(404);
  });
});

describe('Query validation', () => {
  it('passes valid query params to handler', async () => {
    // Create a user first
    await server.fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...AUTH },
      body: JSON.stringify({ name: 'QueryTest', email: 'query@test.com' }),
    });

    const res = await server.fetch('/api/users?name=QueryTest', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('QueryTest');
  });
});
