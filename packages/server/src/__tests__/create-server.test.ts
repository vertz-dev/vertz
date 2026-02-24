import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { createServer } from '../create-server';

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  name: d.text(),
});

const usersModel = d.model(usersTable);

describe('createServer', () => {
  it('creates server with entities using noop DB adapter when no factory provided', () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
          name: 'users',
          model: usersModel,
          access: {
            list: () => true,
            get: () => true,
            create: () => true,
            update: () => true,
            delete: () => true,
          },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
    });

    expect(app).toBeDefined();
    expect(app.handler).toBeTypeOf('function');
  });

  it('noop DB adapter serves requests when no factory provided', async () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
          name: 'users',
          model: usersModel,
          access: {
            list: () => true,
            get: () => true,
            create: () => true,
            update: () => true,
            delete: () => true,
          },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
    });

    // Exercise the noop adapter by hitting the list endpoint
    const listResponse = await app.handler(new Request('http://localhost/api/users'));
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.data).toEqual([]);

    // Exercise noop get (returns null → 404)
    const getResponse = await app.handler(new Request('http://localhost/api/users/123'));
    expect(getResponse.status).toBe(404);

    // Exercise noop create
    const createResponse = await app.handler(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      }),
    );
    expect(createResponse.status).toBe(201);

    // Exercise noop update — entity doesn't exist in noop, returns error
    const updateResponse = await app.handler(
      new Request('http://localhost/api/users/123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bob' }),
      }),
    );
    expect(updateResponse.status).toBe(404);

    // Exercise noop delete — entity doesn't exist in noop, returns 404
    const deleteResponse = await app.handler(
      new Request('http://localhost/api/users/123', { method: 'DELETE' }),
    );
    expect(deleteResponse.status).toBe(404);
  });

  it('creates server without entities when entities array is empty', () => {
    const app = createServer({
      basePath: '/',
      entities: [],
    });

    expect(app).toBeDefined();
  });

  it('creates server without entities when entities is undefined', () => {
    const app = createServer({
      basePath: '/',
    });

    expect(app).toBeDefined();
  });

  it('uses default /api prefix when apiPrefix is not specified', () => {
    const app = createServer({
      basePath: '/',
      entities: [
        {
          name: 'users',
          model: usersModel,
          access: { list: () => true },
          before: {},
          after: {},
          actions: {},
          relations: {},
        },
      ] as never[],
    });

    expect(app).toBeDefined();
  });
});
