/**
 * API client for the Task Manager.
 *
 * The generated entity SDK already returns QueryDescriptors, so pages can use:
 *   const tasks = query(api.tasks.list());     // reactive
 *   const task  = await api.tasks.get(id);      // imperative
 *
 * The generated SDK lives at src/generated/entities/tasks.ts and is
 * auto-created by `vertz dev` (on startup + file changes) and `vertz build`.
 */

import { FetchClient } from '@vertz/fetch';
import { createTasksSdk } from '../generated/entities/tasks';
import type { CreateTaskBody, Task, UpdateTaskBody } from '../lib/types';

const API_BASE =
  typeof window !== 'undefined' && window.location
    ? `${window.location.origin}/api`
    : 'http://localhost:3000/api';

const fetchClient = new FetchClient({ baseURL: API_BASE });

const sdk = createTasksSdk(fetchClient);

export const api = { tasks: sdk };

/**
 * SDK methods for use with form().
 *
 * Wraps descriptor-returning SDK methods to return Promises,
 * since form() expects SdkMethod<TBody, TResult> with Promise return.
 */
export const taskApi = {
  create: Object.assign(
    async (body: CreateTaskBody): Promise<Task> => sdk.create(body),
    { url: '/api/tasks', method: 'POST' as const },
  ),

  update: (id: string) =>
    Object.assign(
      async (body: UpdateTaskBody): Promise<Task> => sdk.update(id, body),
      { url: `/api/tasks/${id}`, method: 'PATCH' as const },
    ),

  delete: (id: string) =>
    Object.assign(
      async (): Promise<void> => sdk.delete(id),
      { url: `/api/tasks/${id}`, method: 'DELETE' as const },
    ),
};
