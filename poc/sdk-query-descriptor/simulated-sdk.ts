/**
 * POC: Simulated generated SDK.
 *
 * Mirrors what @vertz/codegen would produce — entity methods return
 * QueryDescriptor<T> instead of raw Promise<FetchResponse<T>>.
 */

import { createBearerAuthHandle, type BearerAuthHandle } from './auth';
import { createDescriptor, type QueryDescriptor } from './descriptor';

// ---------- Domain types (simulating generated types) ----------

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  status?: string;
  priority?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
}

// ---------- Simulated FetchClient ----------

interface FetchResponse<T> {
  readonly ok: true;
  readonly data: { data: T; status: number; headers: Headers };
}

interface FetchErrorResponse {
  readonly ok: false;
  readonly error: { code: string; message: string };
}

type Result<T> = FetchResponse<T> | FetchErrorResponse;

/** Minimal FetchClient mock for the POC. */
interface Client {
  get<T>(path: string, opts?: { query?: Record<string, unknown> }): Promise<Result<T>>;
  post<T>(path: string, body?: unknown): Promise<Result<T>>;
  patch<T>(path: string, body?: unknown): Promise<Result<T>>;
  delete<T>(path: string): Promise<Result<T>>;
}

// ---------- Generated SDK (what codegen would produce) ----------

export function createTasksSdk(client: Client) {
  return {
    list: Object.assign(
      (queryParams?: Record<string, unknown>): QueryDescriptor<Task[]> =>
        createDescriptor(
          'GET',
          '/tasks',
          () => client.get<Task[]>('/tasks', { query: queryParams }),
          queryParams,
        ),
      { url: '/tasks', method: 'GET' as const },
    ),

    get: Object.assign(
      (id: string): QueryDescriptor<Task> =>
        createDescriptor('GET', `/tasks/${id}`, () => client.get<Task>(`/tasks/${id}`)),
      { url: '/tasks/:id', method: 'GET' as const },
    ),

    create: Object.assign(
      (body: CreateTaskInput): QueryDescriptor<Task> =>
        createDescriptor('POST', '/tasks', () => client.post<Task>('/tasks', body)),
      { url: '/tasks', method: 'POST' as const },
    ),

    update: Object.assign(
      (id: string, body: UpdateTaskInput): QueryDescriptor<Task> =>
        createDescriptor(
          'PATCH',
          `/tasks/${id}`,
          () => client.patch<Task>(`/tasks/${id}`, body),
        ),
      { url: '/tasks/:id', method: 'PATCH' as const },
    ),

    delete: Object.assign(
      (id: string): QueryDescriptor<void> =>
        createDescriptor('DELETE', `/tasks/${id}`, () => client.delete<void>(`/tasks/${id}`)),
      { url: '/tasks/:id', method: 'DELETE' as const },
    ),
  };
}

// ---------- Generated createClient (what codegen would produce) ----------

interface TaskManagerClientConfig {
  baseURL: string;
  auth?: {
    token: string | (() => string | null);
  };
}

interface TaskManagerClient {
  tasks: ReturnType<typeof createTasksSdk>;
  auth: BearerAuthHandle;
}

export function createClient(config: TaskManagerClientConfig): TaskManagerClient {
  const authHandle = createBearerAuthHandle(config.auth?.token);

  // In real implementation, FetchClient would be created here.
  // For POC, we use a mock client.
  const mockClient: Client = {
    async get<T>(_path: string, _opts?: { query?: Record<string, unknown> }) {
      return {
        ok: true as const,
        data: { data: [] as unknown as T, status: 200, headers: new Headers() },
      };
    },
    async post<T>(_path: string, body?: unknown) {
      return {
        ok: true as const,
        data: {
          data: { id: 'new-id', ...(body as object) } as unknown as T,
          status: 201,
          headers: new Headers(),
        },
      };
    },
    async patch<T>(_path: string, body?: unknown) {
      return {
        ok: true as const,
        data: {
          data: { id: 'updated-id', ...(body as object) } as unknown as T,
          status: 200,
          headers: new Headers(),
        },
      };
    },
    async delete<T>(_path: string) {
      return {
        ok: true as const,
        data: { data: undefined as unknown as T, status: 204, headers: new Headers() },
      };
    },
  };

  return {
    tasks: createTasksSdk(mockClient),
    auth: authHandle,
  };
}
