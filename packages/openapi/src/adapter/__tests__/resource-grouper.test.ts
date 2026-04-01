import { describe, expect, it } from 'bun:test';
import { groupOperations } from '../resource-grouper';
import { sanitizeIdentifier } from '../identifier';
import type { ParsedOperation } from '../../parser/types';

function createOperation(
  overrides: Partial<ParsedOperation> &
    Pick<ParsedOperation, 'operationId' | 'methodName' | 'method' | 'path'>,
): ParsedOperation {
  return {
    operationId: overrides.operationId,
    methodName: overrides.methodName,
    method: overrides.method,
    path: overrides.path,
    pathParams: overrides.pathParams ?? [],
    queryParams: overrides.queryParams ?? [],
    requestBody: overrides.requestBody,
    response: overrides.response,
    responseStatus: overrides.responseStatus ?? 200,
    tags: overrides.tags ?? [],
  };
}

describe('groupOperations', () => {
  it('groups operations by their first tag', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_tasks',
          methodName: 'list',
          method: 'GET',
          path: '/tasks',
          tags: ['Tasks'],
        }),
        createOperation({
          operationId: 'create_tasks',
          methodName: 'create',
          method: 'POST',
          path: '/tasks',
          tags: ['Tasks', 'Admin'],
        }),
      ],
      'tag',
    );

    expect(resources).toEqual([
      {
        name: 'Tasks',
        identifier: 'tasks',
        operations: [
          expect.objectContaining({ operationId: 'list_tasks' }),
          expect.objectContaining({ operationId: 'create_tasks' }),
        ],
      },
    ]);
  });

  it('puts untagged operations in the _ungrouped resource', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_misc',
          methodName: 'list',
          method: 'GET',
          path: '/misc',
        }),
      ],
      'tag',
    );

    expect(resources).toEqual([
      {
        name: 'Ungrouped',
        identifier: '_ungrouped',
        operations: [expect.objectContaining({ operationId: 'list_misc' })],
      },
    ]);
  });

  it('uses only the first tag and sanitizes the resource identity', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_task_management',
          methodName: 'list',
          method: 'GET',
          path: '/task-management',
          tags: ['Task Management', 'Admin'],
        }),
      ],
      'tag',
    );

    expect(resources).toEqual([
      {
        name: 'TaskManagement',
        identifier: 'taskManagement',
        operations: [expect.objectContaining({ operationId: 'list_task_management' })],
      },
    ]);
  });

  it('groups /tasks and /tasks/{id} together in path mode', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_tasks',
          methodName: 'list',
          method: 'GET',
          path: '/tasks',
        }),
        createOperation({
          operationId: 'get_task',
          methodName: 'get',
          method: 'GET',
          path: '/tasks/{id}',
        }),
      ],
      'path',
    );

    expect(resources).toEqual([
      {
        name: 'Tasks',
        identifier: 'tasks',
        operations: [
          expect.objectContaining({ operationId: 'list_tasks' }),
          expect.objectContaining({ operationId: 'get_task' }),
        ],
      },
    ]);
  });

  it('strips /api and version prefixes in path mode and groups by the last meaningful segment', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_tasks',
          methodName: 'list',
          method: 'GET',
          path: '/api/v2/tasks',
        }),
        createOperation({
          operationId: 'list_task_comments',
          methodName: 'listComments',
          method: 'GET',
          path: '/api/v2/tasks/{id}/comments',
        }),
      ],
      'path',
    );

    expect(resources).toEqual([
      {
        name: 'Tasks',
        identifier: 'tasks',
        operations: [expect.objectContaining({ operationId: 'list_tasks' })],
      },
      {
        name: 'Comments',
        identifier: 'comments',
        operations: [expect.objectContaining({ operationId: 'list_task_comments' })],
      },
    ]);
  });

  it('puts every operation in its own resource when grouping is disabled', () => {
    const resources = groupOperations(
      [
        createOperation({
          operationId: 'list_tasks',
          methodName: 'list',
          method: 'GET',
          path: '/tasks',
        }),
        createOperation({
          operationId: 'archive_task',
          methodName: 'archive',
          method: 'POST',
          path: '/tasks/{id}/archive',
        }),
      ],
      'none',
    );

    expect(resources).toHaveLength(2);
    expect(resources[0]?.identifier).toBe('listTasks');
    expect(resources[1]?.identifier).toBe('archiveTask');
  });
});

describe('sanitizeIdentifier', () => {
  it('sanitizes Task Management to taskManagement', () => {
    expect(sanitizeIdentifier('Task Management')).toBe('taskManagement');
  });

  it('sanitizes v2/tasks to v2Tasks', () => {
    expect(sanitizeIdentifier('v2/tasks')).toBe('v2Tasks');
  });

  it('sanitizes admin.users to adminUsers', () => {
    expect(sanitizeIdentifier('admin.users')).toBe('adminUsers');
  });

  it('normalizes TASKS to tasks', () => {
    expect(sanitizeIdentifier('TASKS')).toBe('tasks');
  });

  it('prefixes identifiers that start with numbers', () => {
    expect(sanitizeIdentifier('123invalid')).toBe('_123invalid');
  });
});
