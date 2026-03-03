import { createServer, NotFoundException } from '@vertz/core';
import { s } from '@vertz/schema';
import type { RuntimeAdapter } from '../runtime-adapters/types';
import { authMiddleware } from './middleware/auth';

export interface TestServer {
  handler: (request: Request) => Promise<Response>;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => void | Promise<void>;
  port: number;
  url: string;
}

export function createRoutes() {
  const users = new Map<string, { id: string; name: string; email: string }>();
  const todos = new Map<string, { id: string; title: string; userId: string; done: boolean }>();

  return [
    // Users CRUD
    {
      method: 'GET',
      path: '/api/users',
      handler: (ctx: Record<string, unknown>) => {
        const query = ctx.query as Record<string, string | undefined>;
        const name = query.name;
        const allUsers = [...users.values()];
        return name
          ? allUsers.filter((u) => u.name.toLowerCase().includes(name.toLowerCase()))
          : allUsers;
      },
    },
    {
      method: 'GET',
      path: '/api/users/:id',
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        const user = users.get(params.id);
        if (!user) throw new NotFoundException(`User ${params.id} not found`);
        return user;
      },
    },
    {
      method: 'POST',
      path: '/api/users',
      bodySchema: s.object({ name: s.string().min(1), email: s.email() }),
      handler: (ctx: Record<string, unknown>) => {
        const body = ctx.body as { name: string; email: string };
        const id = crypto.randomUUID();
        const user = { id, ...body };
        users.set(id, user);
        return user;
      },
    },
    {
      method: 'PUT',
      path: '/api/users/:id',
      bodySchema: s.object({ name: s.string().min(1), email: s.email() }),
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        const body = ctx.body as { name: string; email: string };
        const user = users.get(params.id);
        if (!user) throw new NotFoundException(`User ${params.id} not found`);
        const updated = { ...user, ...body };
        users.set(params.id, updated);
        return updated;
      },
    },
    {
      method: 'DELETE',
      path: '/api/users/:id',
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        if (!users.has(params.id)) throw new NotFoundException(`User ${params.id} not found`);
        users.delete(params.id);
        return undefined;
      },
    },
    // Todos CRUD
    {
      method: 'GET',
      path: '/api/todos',
      handler: (ctx: Record<string, unknown>) => {
        const query = ctx.query as Record<string, string | undefined>;
        const userId = query.userId;
        const allTodos = [...todos.values()];
        return userId ? allTodos.filter((t) => t.userId === userId) : allTodos;
      },
    },
    {
      method: 'GET',
      path: '/api/todos/:id',
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        const todo = todos.get(params.id);
        if (!todo) throw new NotFoundException(`Todo ${params.id} not found`);
        return todo;
      },
    },
    {
      method: 'POST',
      path: '/api/todos',
      bodySchema: s.object({ title: s.string().min(1), userId: s.string() }),
      handler: (ctx: Record<string, unknown>) => {
        const body = ctx.body as { title: string; userId: string };
        // Cross-DI: validate user exists
        if (!users.has(body.userId)) throw new NotFoundException(`User ${body.userId} not found`);
        const id = crypto.randomUUID();
        const todo = { id, ...body, done: false };
        todos.set(id, todo);
        return todo;
      },
    },
    {
      method: 'PATCH',
      path: '/api/todos/:id/complete',
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        const todo = todos.get(params.id);
        if (!todo) throw new NotFoundException(`Todo ${params.id} not found`);
        const updated = { ...todo, done: !todo.done };
        todos.set(params.id, updated);
        return updated;
      },
    },
    {
      method: 'DELETE',
      path: '/api/todos/:id',
      handler: (ctx: Record<string, unknown>) => {
        const params = ctx.params as { id: string };
        if (!todos.has(params.id)) throw new NotFoundException(`Todo ${params.id} not found`);
        todos.delete(params.id);
        return undefined;
      },
    },
  ];
}

export function createIntegrationApp(): TestServer {
  const app = createServer({ cors: { origins: true }, _entityRoutes: createRoutes() }).middlewares([
    authMiddleware,
  ]);

  const handler = app.handler;

  return {
    handler,
    fetch: (path, init) => handler(new Request(`http://localhost${path}`, init)),
    stop: () => {},
    port: 0,
    url: 'http://localhost',
  };
}

export async function createIntegrationServer(adapter: RuntimeAdapter): Promise<TestServer> {
  const app = createServer({ cors: { origins: true }, _entityRoutes: createRoutes() }).middlewares([
    authMiddleware,
  ]);

  const handler = app.handler;
  const handle = await adapter.createServer(handler);

  return {
    handler,
    fetch: (path, init) => globalThis.fetch(`${handle.url}${path}`, init),
    stop: () => handle.close(),
    port: handle.port,
    url: handle.url,
  };
}
