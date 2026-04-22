import { describe, expect, it } from '@vertz/test';
import type { DocsBundle } from '../tools';
import { getDoc, getExample, listGuides, searchDocs } from '../tools';
import { buildIndex } from '../search';

function makeBundle(): DocsBundle {
  return {
    index: buildIndex([
      {
        id: 'guides/entities',
        title: 'Entities',
        path: 'guides/entities',
        body: 'Define an entity using d.table()',
      },
      {
        id: 'guides/services',
        title: 'Services',
        path: 'guides/services',
        body: 'Wrap REST endpoints in a service',
      },
    ]),
    contents: {
      'guides/entities': '# Entities\n\nDefine an entity using d.table().',
      'guides/services': '# Services\n\nWrap REST endpoints in a service.',
    },
    guides: [
      { path: 'guides/entities', title: 'Entities', description: 'How to define entities' },
      { path: 'guides/services', title: 'Services' },
    ],
    examples: {
      'task-manager': '// Example: task manager\nexport const tasks = d.table(...)',
    },
  };
}

describe('searchDocs()', () => {
  describe('Given a bundle and a query that matches one doc', () => {
    it('returns top hits with id, title, path, score, and snippet', () => {
      const bundle = makeBundle();

      const result = searchDocs(bundle, { query: 'entity' });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]?.id).toBe('guides/entities');
      expect(result.results[0]?.title).toBe('Entities');
      expect(result.results[0]?.path).toBe('guides/entities');
      expect(result.results[0]?.score).toBeGreaterThan(0);
      expect(typeof result.results[0]?.snippet).toBe('string');
    });
  });

  describe('Given a bundle of two matching docs and limit=1', () => {
    it('returns exactly one result', () => {
      const bundle = makeBundle();

      const result = searchDocs(bundle, { query: 'service entity', limit: 1 });

      expect(result.results.length).toBe(1);
    });
  });
});

describe('getDoc()', () => {
  describe('Given a path that exists', () => {
    it('returns the full markdown content', () => {
      const bundle = makeBundle();

      const result = getDoc(bundle, { path: 'guides/entities' });

      expect(result.found).toBe(true);
      expect(result.content).toContain('# Entities');
    });
  });

  describe('Given a path that does not exist', () => {
    it('returns found=false with a helpful message', () => {
      const bundle = makeBundle();

      const result = getDoc(bundle, { path: 'guides/nonexistent' });

      expect(result.found).toBe(false);
      expect(result.content).toBe('');
    });
  });

  describe('Given a path with a leading slash or .mdx extension', () => {
    it('normalizes and still resolves', () => {
      const bundle = makeBundle();

      expect(getDoc(bundle, { path: '/guides/entities' }).found).toBe(true);
      expect(getDoc(bundle, { path: 'guides/entities.mdx' }).found).toBe(true);
    });
  });
});

describe('listGuides()', () => {
  it('returns the bundle guides list', () => {
    const bundle = makeBundle();

    const result = listGuides(bundle);

    expect(result.guides.length).toBe(2);
    expect(result.guides[0]?.path).toBe('guides/entities');
    expect(result.guides[0]?.title).toBe('Entities');
    expect(result.guides[0]?.description).toBe('How to define entities');
  });
});

describe('getExample()', () => {
  describe('Given a name that exists', () => {
    it('returns the full source', () => {
      const bundle = makeBundle();

      const result = getExample(bundle, { name: 'task-manager' });

      expect(result.found).toBe(true);
      expect(result.source).toContain('task manager');
    });
  });

  describe('Given a name that does not exist', () => {
    it('returns found=false', () => {
      const bundle = makeBundle();

      const result = getExample(bundle, { name: 'nonexistent' });

      expect(result.found).toBe(false);
      expect(result.source).toBe('');
    });
  });
});
