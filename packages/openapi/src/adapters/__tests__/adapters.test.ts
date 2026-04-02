import { describe, expect, it } from 'bun:test';
import { normalizeOperationId } from '../../parser/operation-id-normalizer';
import type { OperationContext } from '../../parser/operation-id-normalizer';
import { fastapi, nestjs } from '../index';

function ctx(overrides: Partial<OperationContext>): OperationContext {
  return {
    operationId: '',
    method: 'GET',
    path: '/',
    tags: [],
    hasBody: false,
    ...overrides,
  };
}

describe('fastapi adapter', () => {
  const config = fastapi();

  it('strips route+verb suffix from FastAPI operationIds', () => {
    // FastAPI: @app.get("/tasks") def list_tasks() → "list_tasks_tasks_get"
    const result = normalizeOperationId(
      'list_tasks_tasks_get',
      'GET',
      '/tasks',
      config,
      ctx({ operationId: 'list_tasks_tasks_get', method: 'GET', path: '/tasks' }),
    );
    expect(result).toBe('list_tasks');
  });

  it('strips versioned route suffix and appends version', () => {
    // FastAPI: @app.get("/v1/users/{id}") def get_user() → "get_user_v1_users__id__get"
    const result = normalizeOperationId(
      'get_user_v1_users__id__get',
      'GET',
      '/v1/users/{id}',
      config,
      ctx({ operationId: 'get_user_v1_users__id__get', method: 'GET', path: '/v1/users/{id}' }),
    );
    expect(result).toBe('get_user_v1');
  });

  it('appends version prefix for POST routes', () => {
    const result = normalizeOperationId(
      'create_task_v2_tasks_post',
      'POST',
      '/v2/tasks',
      config,
      ctx({ operationId: 'create_task_v2_tasks_post', method: 'POST', path: '/v2/tasks' }),
    );
    expect(result).toBe('create_task_v2');
  });

  it('does not double-append version if already in the base name', () => {
    const result = normalizeOperationId(
      'list_v1_v1_items_get',
      'GET',
      '/v1/items',
      config,
      ctx({ operationId: 'list_v1_v1_items_get', method: 'GET', path: '/v1/items' }),
    );
    expect(result).toBe('list_v1');
  });

  it('handles routes without version prefix', () => {
    const result = normalizeOperationId(
      'health_check_health_get',
      'GET',
      '/health',
      config,
      ctx({ operationId: 'health_check_health_get', method: 'GET', path: '/health' }),
    );
    expect(result).toBe('health_check');
  });

  it('handles nested routes with path params', () => {
    // /tasks/{id}/comments → parsedRoute = tasks__id__comments
    const result = normalizeOperationId(
      'get_task_comments_tasks__id__comments_get',
      'GET',
      '/tasks/{id}/comments',
      config,
      ctx({
        operationId: 'get_task_comments_tasks__id__comments_get',
        method: 'GET',
        path: '/tasks/{id}/comments',
      }),
    );
    expect(result).toBe('get_task_comments');
  });

  it('handles DELETE methods', () => {
    const result = normalizeOperationId(
      'delete_task_tasks__id__delete',
      'DELETE',
      '/tasks/{id}',
      config,
      ctx({ operationId: 'delete_task_tasks__id__delete', method: 'DELETE', path: '/tasks/{id}' }),
    );
    expect(result).toBe('delete_task');
  });
});

describe('nestjs adapter', () => {
  const config = nestjs();

  it('strips Controller prefix with underscore separator', () => {
    const result = normalizeOperationId(
      'TasksController_findAll',
      'GET',
      '/tasks',
      config,
      ctx({ operationId: 'TasksController_findAll', method: 'GET', path: '/tasks' }),
    );
    expect(result).toBe('findAll');
  });

  it('strips Controller prefix with dot separator', () => {
    const result = normalizeOperationId(
      'UsersController.getById',
      'GET',
      '/users/{id}',
      config,
      ctx({ operationId: 'UsersController.getById', method: 'GET', path: '/users/{id}' }),
    );
    expect(result).toBe('getById');
  });

  it('passes through operationIds without Controller prefix', () => {
    const result = normalizeOperationId(
      'listTasks',
      'GET',
      '/tasks',
      config,
      ctx({ operationId: 'listTasks', method: 'GET', path: '/tasks' }),
    );
    expect(result).toBe('listTasks');
  });

  it('handles AppController prefix', () => {
    const result = normalizeOperationId(
      'AppController_healthCheck',
      'GET',
      '/health',
      config,
      ctx({ operationId: 'AppController_healthCheck', method: 'GET', path: '/health' }),
    );
    expect(result).toBe('healthCheck');
  });
});
