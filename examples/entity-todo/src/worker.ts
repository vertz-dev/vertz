/**
 * Cloudflare Worker entry point for Entity Todo.
 *
 * Route splitting:
 * - /api/* → JSON API handler (in-memory CRUD for demo)
 * - /*       → SSR HTML render
 */

import { renderApp } from './entry-server';

// ---------------------------------------------------------------------------
// In-memory database (demo purposes - use @vertz/db in production)
// ---------------------------------------------------------------------------

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Simple in-memory store
const db = new Map<string, Todo>();

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

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
// API Handlers
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/todos - List all todos
 */
async function handleListTodos(_request: Request): Promise<Response> {
  const todos = Array.from(db.values());
  // SDK expects raw array - FetchClient wraps in { data, status, headers }
  return new Response(JSON.stringify(todos), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle GET /api/todos/:id - Get a single todo
 */
async function handleGetTodo(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }
  
  const todo = db.get(id);
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
async function handleCreateTodo(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    
    if (!body.title || typeof body.title !== 'string') {
      return new Response(JSON.stringify({ error: 'Title is required' }), { status: 400 });
    }
    
    const nowTimestamp = now();
    const todo: Todo = {
      id: generateId(),
      title: body.title,
      completed: false,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    };
    
    db.set(todo.id, todo);
    
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
async function handleUpdateTodo(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }
  
  const existing = db.get(id);
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  
  try {
    const body = await request.json();
    
    const updated: Todo = {
      ...existing,
      title: body.title ?? existing.title,
      completed: body.completed ?? existing.completed,
      updatedAt: now(),
    };
    
    db.set(id, updated);
    
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
async function handleDeleteTodo(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID required' }), { status: 400 });
  }
  
  if (!db.has(id)) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  
  db.delete(id);
  
  return new Response(null, { status: 204 });
}

/**
 * Dispatch API requests to the appropriate handler
 */
async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  
  // Route: /api/todos
  if (path === '/api/todos' || path === '/api/todos/') {
    if (method === 'GET') return handleListTodos(request);
    if (method === 'POST') return handleCreateTodo(request);
  }
  
  // Route: /api/todos/:id
  const idMatch = path.match(/^\/api\/todos\/([^\/]+)$/);
  if (idMatch) {
    if (method === 'GET') return handleGetTodo(request);
    if (method === 'PATCH') return handleUpdateTodo(request);
    if (method === 'DELETE') return handleDeleteTodo(request);
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
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    
    // Route splitting: /api/* goes to JSON API, everything else goes to SSR
    if (url.pathname.startsWith('/api/')) {
      const response = await handleApi(request);
      return withSecurityHeaders(response);
    }
    
    // All other routes go to SSR
    return handleSsr(request);
  },
};
