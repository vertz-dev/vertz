import { describe, expect, it } from 'bun:test';
import { deriveTypePrefix, normalizeOperationId } from '../operation-id-normalizer';

describe('normalizeOperationId', () => {
  it('maps FastAPI list ids to CRUD list', () => {
    expect(normalizeOperationId('list_tasks_tasks__get', 'GET', '/tasks')).toBe('list');
  });

  it('maps NestJS controller ids to CRUD list', () => {
    expect(normalizeOperationId('TasksController_findAll', 'GET', '/tasks')).toBe('list');
  });

  it('maps Django-style ids to CRUD list', () => {
    expect(normalizeOperationId('tasks_list', 'GET', '/tasks')).toBe('list');
  });

  it('maps Rails-style ids to CRUD get', () => {
    expect(normalizeOperationId('get-task-by-id', 'GET', '/tasks/{id}')).toBe('get');
  });

  it('keeps non-CRUD actions after auto-cleaning', () => {
    expect(normalizeOperationId('archive_task', 'POST', '/tasks/{id}/archive')).toBe('archive');
  });

  it('applies transforms to the auto-cleaned id before CRUD detection', () => {
    expect(
      normalizeOperationId('sync_users', 'GET', '/users', {
        transform: (cleaned) => `do${cleaned[0]?.toUpperCase() ?? ''}${cleaned.slice(1)}`,
      }),
    ).toBe('doSync');
  });

  it('prefers static overrides over transform and CRUD detection', () => {
    expect(
      normalizeOperationId('list_tasks_tasks__get', 'GET', '/tasks', {
        overrides: {
          list_tasks_tasks__get: 'index',
        },
        transform: () => 'customList',
      }),
    ).toBe('index');
  });

  it('passes full OperationContext to transform', () => {
    let receivedCtx: unknown;
    normalizeOperationId(
      'list_tasks_tasks__get',
      'GET',
      '/v1/tasks',
      {
        transform: (_cleaned, ctx) => {
          receivedCtx = ctx;
          return 'test';
        },
      },
      {
        operationId: 'list_tasks_tasks__get',
        method: 'GET',
        path: '/v1/tasks',
        tags: ['tasks'],
        hasBody: false,
      },
    );
    expect(receivedCtx).toEqual({
      operationId: 'list_tasks_tasks__get',
      method: 'GET',
      path: '/v1/tasks',
      tags: ['tasks'],
      hasBody: false,
    });
  });

  it('transform can use path to strip version-prefixed suffixes', () => {
    const result = normalizeOperationId(
      'getUsers_v1_users__id__get',
      'GET',
      '/v1/users/{id}',
      {
        transform: (_cleaned, ctx) => {
          const versionMatch = ctx.path.match(/^\/(v\d+)\//);
          const versionPrefix = versionMatch ? versionMatch[1] : undefined;
          const parsedRoute = ctx.path.replace(/^\//, '').replace(/[{}/-]/g, '_');
          const suffix = `_${parsedRoute}_${ctx.method.toLowerCase()}`;
          const base = ctx.operationId.replace(suffix, '');
          return versionPrefix && !base.endsWith(versionPrefix) ? `${base}_${versionPrefix}` : base;
        },
      },
      {
        operationId: 'getUsers_v1_users__id__get',
        method: 'GET',
        path: '/v1/users/{id}',
        tags: ['users'],
        hasBody: false,
      },
    );
    expect(result).toBe('getUsers_v1');
  });

  it('falls back to the auto-cleaned operation id when no CRUD pattern matches', () => {
    expect(normalizeOperationId('publish-blog_post-post', 'POST', '/blog-posts/publish')).toBe(
      'publishBlogPost',
    );
  });
});

describe('deriveTypePrefix', () => {
  it('strips trailing HTTP method and path segments from FastAPI-style operationId', () => {
    expect(
      deriveTypePrefix(
        'list_brand_competitors_web_brand_id_competitors_get',
        '/web/brand/{brandId}/competitors',
      ),
    ).toBe('ListBrandCompetitors');
  });

  it('strips path params and segments from long operationId', () => {
    expect(
      deriveTypePrefix(
        'stream_site_indexing_progress_web_organizations_organization_id_brands_brand_id_site_indexing_mapped_site_id_progress_get',
        '/web/organizations/{organizationId}/brands/{brandId}/site-indexing/{mappedSiteId}/progress',
      ),
    ).toBe('StreamSiteIndexingProgress');
  });

  it('strips path-derived words from POST operationId', () => {
    expect(
      deriveTypePrefix(
        're_evaluate_observations_internal_brands_brand_id_re_evaluate_observations_post',
        '/internal/brands/{brandId}/re-evaluate-observations',
      ),
    ).toBe('ReEvaluateObservations');
  });

  it('preserves short operationIds that have no path redundancy', () => {
    expect(deriveTypePrefix('listTasks', '/tasks')).toBe('ListTasks');
  });

  it('preserves all words when result would be too short', () => {
    expect(deriveTypePrefix('get_tasks', '/tasks')).toBe('GetTasks');
  });

  it('handles camelCase operationIds', () => {
    expect(deriveTypePrefix('getBrandAnalytics', '/brands/{brandId}/analytics')).toBe(
      'GetBrandAnalytics',
    );
  });

  it('strips NestJS controller prefix', () => {
    expect(deriveTypePrefix('TasksController_listTasks', '/tasks')).toBe('ListTasks');
  });
});
