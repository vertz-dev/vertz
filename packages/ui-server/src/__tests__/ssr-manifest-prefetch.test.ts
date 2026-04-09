/**
 * Tests for manifest-driven descriptor reconstruction — produces real
 * QueryDescriptors from manifest metadata + route params + API client.
 */
import { describe, expect, it } from '@vertz/test';
import type { ExtractedQuery } from '../compiler/prefetch-manifest';
import { reconstructDescriptors } from '../ssr-manifest-prefetch';

// ─── Mock API client ─────────────────────────────────────────────

function serializeQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

function mockDescriptor(method: string, path: string, query?: Record<string, unknown>) {
  const key = `${method}:${path}${serializeQuery(query)}`;
  return {
    _tag: 'QueryDescriptor' as const,
    _key: key,
    _fetch: async () => ({ ok: true as const, data: { items: [] } }),
  };
}

const mockApi = {
  projects: {
    list: (query?: Record<string, unknown>) => mockDescriptor('GET', '/projects', query),
    get: (id: string, options?: Record<string, unknown>) =>
      mockDescriptor('GET', `/projects/${id}`, options),
  },
  issues: {
    list: (query?: Record<string, unknown>) => mockDescriptor('GET', '/issues', query),
    get: (id: string, options?: Record<string, unknown>) =>
      mockDescriptor('GET', `/issues/${id}`, options),
  },
  labels: {
    list: (query?: Record<string, unknown>) => mockDescriptor('GET', '/labels', query),
  },
};

// ─── Tests ───────────────────────────────────────────────────────

describe('Feature: Descriptor reconstruction from manifest', () => {
  describe('Given entry { entity: "projects", operation: "list" } with no bindings', () => {
    const queries: ExtractedQuery[] = [
      { descriptorChain: 'api.projects.list', entity: 'projects', operation: 'list' },
    ];

    it('Then reconstructed key matches api.projects.list()._key', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe(mockApi.projects.list()._key);
    });
  });

  describe('Given entry { entity: "projects", operation: "get", idParam: "projectId" }', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.projects.get',
        entity: 'projects',
        operation: 'get',
        idParam: 'projectId',
      },
    ];

    it('Then reconstructed key matches api.projects.get("abc123")._key', () => {
      const result = reconstructDescriptors(queries, { projectId: 'abc123' }, mockApi);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe(mockApi.projects.get('abc123')._key);
    });
  });

  describe('Given entry with where bindings referencing route params', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.list',
        entity: 'issues',
        operation: 'list',
        queryBindings: { where: { projectId: '$projectId' } },
      },
    ];

    it('Then reconstructed key includes resolved where param', () => {
      const result = reconstructDescriptors(queries, { projectId: 'abc123' }, mockApi);

      expect(result).toHaveLength(1);
      const expectedKey = mockApi.issues.list({ where: { projectId: 'abc123' } })._key;
      expect(result[0].key).toBe(expectedKey);
    });
  });

  describe('Given entry with static select bindings', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.list',
        entity: 'issues',
        operation: 'list',
        queryBindings: {
          where: { projectId: '$projectId' },
          select: { id: true, title: true },
        },
      },
    ];

    it('Then reconstructed key includes select in the query', () => {
      const result = reconstructDescriptors(queries, { projectId: 'abc123' }, mockApi);

      expect(result).toHaveLength(1);
      const expectedKey = mockApi.issues.list({
        where: { projectId: 'abc123' },
        select: { id: true, title: true },
      })._key;
      expect(result[0].key).toBe(expectedKey);
    });
  });

  describe('Given entry with idParam and select options', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.get',
        entity: 'issues',
        operation: 'get',
        idParam: 'issueId',
        queryBindings: { select: { id: true, title: true } },
      },
    ];

    it('Then reconstructed key matches get(id, { select })._key', () => {
      const result = reconstructDescriptors(queries, { issueId: 'i-99' }, mockApi);

      expect(result).toHaveLength(1);
      const expectedKey = mockApi.issues.get('i-99', { select: { id: true, title: true } })._key;
      expect(result[0].key).toBe(expectedKey);
    });
  });

  describe('Given module.api is undefined', () => {
    it('Then returns empty array (graceful degradation)', () => {
      const queries: ExtractedQuery[] = [
        { descriptorChain: 'api.projects.list', entity: 'projects', operation: 'list' },
      ];
      const result = reconstructDescriptors(queries, {}, undefined);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given entry with entity not in api client', () => {
    const queries: ExtractedQuery[] = [
      { descriptorChain: 'api.unknown.list', entity: 'unknown', operation: 'list' },
    ];

    it('Then that query is skipped', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given entry with operation not in entity SDK', () => {
    const queries: ExtractedQuery[] = [
      { descriptorChain: 'api.projects.delete', entity: 'projects', operation: 'delete' },
    ];

    it('Then that query is skipped', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given entry missing entity/operation (variable reference)', () => {
    const queries: ExtractedQuery[] = [{ descriptorChain: 'someDescriptor' }];

    it('Then that query is skipped', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given multiple queries for the same route', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.list',
        entity: 'issues',
        operation: 'list',
        queryBindings: { where: { projectId: '$projectId' } },
      },
      {
        descriptorChain: 'api.projects.get',
        entity: 'projects',
        operation: 'get',
        idParam: 'projectId',
      },
      {
        descriptorChain: 'api.labels.list',
        entity: 'labels',
        operation: 'list',
        queryBindings: { where: { projectId: '$projectId' } },
      },
    ];

    it('Then all queries are reconstructed', () => {
      const result = reconstructDescriptors(queries, { projectId: 'p-1' }, mockApi);

      expect(result).toHaveLength(3);
      expect(result[0].key).toBe(mockApi.issues.list({ where: { projectId: 'p-1' } })._key);
      expect(result[1].key).toBe(mockApi.projects.get('p-1')._key);
      expect(result[2].key).toBe(mockApi.labels.list({ where: { projectId: 'p-1' } })._key);
    });
  });

  describe('Given entry with where binding containing null (dynamic value)', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.list',
        entity: 'issues',
        operation: 'list',
        queryBindings: { where: { title: null } },
      },
    ];

    it('Then that query is skipped (cannot resolve dynamic where)', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given entry with where binding referencing missing route param', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.issues.list',
        entity: 'issues',
        operation: 'list',
        queryBindings: { where: { projectId: '$projectId' } },
      },
    ];

    it('Then that query is skipped (param not in URL)', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given entry with idParam but param not in URL', () => {
    const queries: ExtractedQuery[] = [
      {
        descriptorChain: 'api.projects.get',
        entity: 'projects',
        operation: 'get',
        idParam: 'projectId',
      },
    ];

    it('Then that query is skipped', () => {
      const result = reconstructDescriptors(queries, {}, mockApi);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given API client factory that throws', () => {
    const queries: ExtractedQuery[] = [
      { descriptorChain: 'api.projects.list', entity: 'projects', operation: 'list' },
    ];

    it('Then that query is skipped (graceful degradation)', () => {
      const throwingApi = {
        projects: {
          list: () => {
            throw new Error('Factory bug');
          },
        },
      };
      const result = reconstructDescriptors(
        queries,
        {},
        throwingApi as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>,
      );

      expect(result).toHaveLength(0);
    });
  });
});
