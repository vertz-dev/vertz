/**
 * Cloudflare Worker entry point for Entity Todo.
 *
 * Route splitting:
 * - /api/* → JSON API handler (uses D1 database)
 * - /*       → SSR HTML render
 */

import { createDb, d } from '@vertz/db';
import { renderApp } from './entry-server';
import type { D1Database } from '@vertz/db';

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

const dbModels = {
  todos: d.model(todosTable),
};

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Database instance (initialized lazily)
// ---------------------------------------------------------------------------

interface Env {
  DB: D1Database;
}

let db: ReturnType<typeof createDb<typeof dbModels>> | null = null;

function getDb(env: Env) {
  if (!db) {
    db = createDb({
      models: dbModels,
      dialect: 'sqlite',
      d1: env.DB,
    });
  }
  return db;
}

// ---------------------------------------------------------------------------
// API Handlers
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/todos - List all todos
 */
async function handleListTodos(_request: Request, env: Env): Promise<Response> {
  const database = getDb(env);
  const todos = await database.todos.findMany();
  return new Response(JSON.stringify(todos), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle GET /api/todos/:id - Get a single todo
 */
async function handleGetTodo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }

  const database = getDb(env);
  const todo = await database.todos.findById(id);

  if (!todo) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  return new Response(JSON.stringify(todo), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle POST /api/todos - Create a new todo
 */
async function handleCreateTodo(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json();

    if (!body.title || typeof body.title !== 'string') {
      return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 });
    }

    const database = getDb(env);
    const todo = await database.todos.create({
      title: body.title,
      completed: false,
    });

    return new Response(JSON.stringify(todo), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
}

/**
 * Handle PATCH /api/todos/:id - Update a todo
 */
async function handleUpdateTodo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }

  const database = getDb(env);
  const existing = await database.todos.findById(id);

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  try {
    const body = await request.json();

    const updated = await database.todos.update(id, {
      title: body.title ?? undefined,
      completed: body.completed ?? undefined,
    });

    return new Response(JSON.stringify(updated), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
}

/**
 * Handle DELETE /api/todos/:id - Delete a todo
 */
async function handleDeleteTodo(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }

  const database = getDb(env);
  const existing = await database.todos.findById(id);

  if (!existing) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  await database.todos.delete(id);

  return new Response(null, { status: 204 });
}

/**
 * Dispatch API requests to the appropriate handler
 */
async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // Route: /api/todos
  if (path === '/api/todos' || path === '/api/todos/') {
    if (method === 'GET') return handleListTodos(request, env);
    if (method === 'POST') return handleCreateTodo(request, env);
  }

  // Route: /api/todos/:id
  const idMatch = path.match(/^\/api\/todos\/([^\/]+)$/);
  if (idMatch) {
    if (method === 'GET') return handleGetTodo(request, env);
    if (method === 'PATCH') return handleUpdateTodo(request, env);
    if (method === 'DELETE') return handleDeleteTodo(request, env);
  }

  // No matching route
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

// ---------------------------------------------------------------------------
// SSR Handler
// ---------------------------------------------------------------------------

/**
 * Handle SSR requests - render the app to HTML.
 */
async function handleSsr(request: Request): Promise<Response> {
  const response = await renderApp();
  return withSecurityHeaders(response);
}

// ---------------------------------------------------------------------------
// Main worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // Route splitting: /api/* goes to JSON API, everything else goes to SSR
    if (url.pathname.startsWith('/api/')) {
      const response = await handleApi(request, env);
      return withSecurityHeaders(response);
    }

    // All other routes go to SSR
    return handleSsr(request);
  },
};
