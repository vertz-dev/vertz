/**
 * POC Tests: QueryDescriptor behavior.
 *
 * Validates unknowns from plans/sdk-query-integration.md:
 * - Unknown #1: TypeScript inference through QueryDescriptor
 * - Unknown #2: Thenable + await interaction
 * - Unknown #3: Key derivation for parameterized queries
 * - Unknown #4: DELETE 204 handling
 * - Unknown #5: query() overload resolution
 */

import { describe, expect, test } from 'bun:test';
import { createDescriptor, isQueryDescriptor, query, type QueryDescriptor } from './descriptor';
import { createClient, type Task } from './simulated-sdk';

// ---------- Test helpers ----------

function mockFetchSuccess<T>(data: T) {
  return async () => ({
    ok: true as const,
    data: { data, status: 200, headers: new Headers() },
  });
}

function mockFetchError(code: string, message: string) {
  return async () => ({
    ok: false as const,
    error: { code, message },
  });
}

// ---------- Unknown #1: TypeScript inference through QueryDescriptor ----------

describe('Unknown #1: TypeScript inference through QueryDescriptor', () => {
  test('query(descriptor) infers T correctly', () => {
    const api = createClient({ baseURL: '/api' });

    // This is the key test: does TS infer the type through the descriptor?
    const tasks = query(api.tasks.list());
    const task = query(api.tasks.get('abc-123'));

    // If TS inference works, these assignments should compile.
    // data is T | undefined at this point.
    const _taskList: Task[] | undefined = tasks.data;
    const _singleTask: Task | undefined = task.data;

    // Verify the QueryResult shape
    expect(tasks).toHaveProperty('data');
    expect(tasks).toHaveProperty('loading');
    expect(tasks).toHaveProperty('error');
    expect(tasks).toHaveProperty('_key');

    // Suppress unused variable warnings
    void _taskList;
    void _singleTask;
  });

  test('query(descriptor) auto-derives key', () => {
    const api = createClient({ baseURL: '/api' });

    const tasks = query(api.tasks.list());
    expect(tasks._key).toBe('GET:/tasks');

    const task = query(api.tasks.get('abc-123'));
    expect(task._key).toBe('GET:/tasks/abc-123');
  });
});

// ---------- Unknown #2: Thenable + await interaction ----------

describe('Unknown #2: Thenable + await interaction', () => {
  test('await descriptor resolves to T', async () => {
    const mockTask: Task = {
      id: 'task-1',
      title: 'Test Task',
      description: 'Description',
      status: 'todo',
      priority: 'medium',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    const descriptor = createDescriptor<Task>(
      'GET',
      '/tasks/task-1',
      mockFetchSuccess(mockTask),
    );

    // The key test: does await resolve to Task (not QueryDescriptor<Task>)?
    const result = await descriptor;

    expect(result.id).toBe('task-1');
    expect(result.title).toBe('Test Task');

    // Type check: result should be Task, not QueryDescriptor<Task>
    const _id: string = result.id;
    const _title: string = result.title;
    void _id;
    void _title;
  });

  test('await descriptor throws on error', async () => {
    const descriptor = createDescriptor<Task>(
      'GET',
      '/tasks/missing',
      mockFetchError('NOT_FOUND', 'Task not found'),
    );

    try {
      await descriptor;
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      const error = e as { code: string; message: string };
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Task not found');
    }
  });

  test('Promise.all works with multiple descriptors', async () => {
    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Task 1',
        description: 'D1',
        status: 'todo',
        priority: 'low',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const singleTask: Task = {
      id: 'task-2',
      title: 'Task 2',
      description: 'D2',
      status: 'done',
      priority: 'high',
      createdAt: '',
      updatedAt: '',
    };

    const desc1 = createDescriptor<Task[]>('GET', '/tasks', mockFetchSuccess(tasks));
    const desc2 = createDescriptor<Task>('GET', '/tasks/task-2', mockFetchSuccess(singleTask));

    const [allTasks, oneTask] = await Promise.all([desc1, desc2]);

    expect(allTasks).toHaveLength(1);
    expect(allTasks[0].title).toBe('Task 1');
    expect(oneTask.title).toBe('Task 2');

    // Type checks
    const _taskArray: Task[] = allTasks;
    const _task: Task = oneTask;
    void _taskArray;
    void _task;
  });

  test('descriptor works in async function context', async () => {
    const api = createClient({ baseURL: '/api' });

    // This simulates: async function handleCreate(body) { const task = await api.tasks.create(body); }
    const task = await api.tasks.create({
      title: 'New Task',
      description: 'Created via await',
    });

    // task should be Task (unwrapped), not a Result or FetchResponse
    expect(task).toHaveProperty('id');
    const _id: string = task.id;
    void _id;
  });
});

// ---------- Unknown #3: Key derivation ----------

describe('Unknown #3: Key derivation for parameterized queries', () => {
  test('list() produces key "GET:/tasks"', () => {
    const desc = createDescriptor<unknown[]>('GET', '/tasks', mockFetchSuccess([]));
    expect(desc._key).toBe('GET:/tasks');
  });

  test('get(id) produces key "GET:/tasks/<id>"', () => {
    const desc = createDescriptor<unknown>('GET', '/tasks/abc-123', mockFetchSuccess({}));
    expect(desc._key).toBe('GET:/tasks/abc-123');
  });

  test('list with query params produces sorted key', () => {
    // Key should include sorted query params for deterministic keys
    const desc = createDescriptor<unknown[]>(
      'GET',
      '/tasks',
      mockFetchSuccess([]),
      { status: 'done', priority: 'high' },
    );
    // Sorted: priority before status
    expect(desc._key).toBe('GET:/tasks?priority=high&status=done');
  });

  test('same params in different order produce same key', () => {
    const desc1 = createDescriptor<unknown[]>(
      'GET',
      '/tasks',
      mockFetchSuccess([]),
      { status: 'done', priority: 'high' },
    );
    const desc2 = createDescriptor<unknown[]>(
      'GET',
      '/tasks',
      mockFetchSuccess([]),
      { priority: 'high', status: 'done' },
    );
    expect(desc1._key).toBe(desc2._key);
  });

  test('different IDs produce different keys', () => {
    const api = createClient({ baseURL: '/api' });
    const task1 = query(api.tasks.get('id-1'));
    const task2 = query(api.tasks.get('id-2'));
    expect(task1._key).not.toBe(task2._key);
    expect(task1._key).toBe('GET:/tasks/id-1');
    expect(task2._key).toBe('GET:/tasks/id-2');
  });

  test('list with query params via SDK produces correct key', () => {
    const api = createClient({ baseURL: '/api' });
    const tasks = query(api.tasks.list({ status: 'done' }));
    expect(tasks._key).toBe('GET:/tasks?status=done');
  });
});

// ---------- Unknown #4: DELETE 204 handling ----------

describe('Unknown #4: DELETE 204 handling', () => {
  test('delete descriptor resolves to void on 204', async () => {
    const api = createClient({ baseURL: '/api' });
    // The mock returns undefined data (simulating 204 No Content)
    const result = await api.tasks.delete('task-to-delete');
    // Should resolve without throwing — void is the expected type
    expect(result).toBeUndefined();
  });
});

// ---------- Unknown #5: query() overload resolution ----------

describe('Unknown #5: query() overload resolution', () => {
  test('query() accepts QueryDescriptor (overload 1)', () => {
    const api = createClient({ baseURL: '/api' });
    const result = query(api.tasks.list());

    // Key is auto-derived from descriptor
    expect(result._key).toBe('GET:/tasks');
    expect(result).toHaveProperty('data');
  });

  test('query() accepts plain thunk (overload 2, backward compat)', () => {
    const result = query(
      () => Promise.resolve([1, 2, 3]),
      { key: 'my-numbers' },
    );

    expect(result._key).toBe('my-numbers');
    expect(result).toHaveProperty('data');
  });

  test('query(descriptor) with options (no key)', () => {
    const api = createClient({ baseURL: '/api' });
    const result = query(api.tasks.get('task-1'), { enabled: false });

    expect(result._key).toBe('GET:/tasks/task-1');
    expect(result.loading).toBe(false); // enabled: false → no loading
  });

  test('isQueryDescriptor distinguishes descriptors from functions', () => {
    const api = createClient({ baseURL: '/api' });
    const descriptor = api.tasks.list();
    const thunk = () => Promise.resolve([]);

    expect(isQueryDescriptor(descriptor)).toBe(true);
    expect(isQueryDescriptor(thunk)).toBe(false);
    expect(isQueryDescriptor(null)).toBe(false);
    expect(isQueryDescriptor(42)).toBe(false);
    expect(isQueryDescriptor('string')).toBe(false);
  });
});

// ---------- Result auto-unwrap ----------

describe('Result auto-unwrap', () => {
  test('success: unwraps Result → FetchResponse → data', async () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Task',
        description: '',
        status: 'todo',
        priority: 'medium',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const desc = createDescriptor<Task[]>('GET', '/tasks', mockFetchSuccess(tasks));
    const result = await desc;

    // result should be Task[] directly — no .data.data chain
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].title).toBe('Task');
  });

  test('error: throws FetchError', async () => {
    const desc = createDescriptor<Task>('GET', '/tasks/missing', mockFetchError('NOT_FOUND', 'Not found'));

    expect(async () => {
      await desc;
    }).toThrow();
  });
});
