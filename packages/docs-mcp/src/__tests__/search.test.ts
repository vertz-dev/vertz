import { describe, expect, it } from '@vertz/test';
import { buildIndex, search } from '../search';

describe('search()', () => {
  describe('Given an index of two documents', () => {
    describe('When searching for a term unique to one document', () => {
      it('then returns that document as the top result', () => {
        const index = buildIndex([
          {
            id: 'guides/entities',
            title: 'Entities',
            path: 'guides/entities',
            body: 'How to define an entity in Vertz with d.table().',
          },
          {
            id: 'guides/services',
            title: 'Services',
            path: 'guides/services',
            body: 'Building services that wrap REST endpoints.',
          },
        ]);

        const results = search(index, 'entity');

        expect(results.length).toBeGreaterThan(0);
        expect(results[0]?.id).toBe('guides/entities');
      });
    });
  });

  describe('Given two docs of similar length where the term appears in one title and one body', () => {
    describe('When searching for that term', () => {
      it('then the title-match doc outranks the body-match doc', () => {
        const index = buildIndex([
          {
            id: 'a',
            title: 'Other Topic',
            path: 'a',
            body: 'Routing is documented below in detail with several extra words to balance length.',
          },
          {
            id: 'b',
            title: 'Routing',
            path: 'b',
            body: 'Other unrelated topic content here that is roughly the same length as a body.',
          },
        ]);

        const results = search(index, 'routing');

        expect(results[0]?.id).toBe('b');
      });
    });
  });

  describe('Given any index', () => {
    describe('When searching with an empty query', () => {
      it('then returns an empty array', () => {
        const index = buildIndex([{ id: 'a', title: 'A', path: 'a', body: 'content' }]);

        expect(search(index, '')).toEqual([]);
        expect(search(index, '   ')).toEqual([]);
      });
    });
  });

  describe('Given an index of three matching docs', () => {
    describe('When searching with limit=2', () => {
      it('then returns at most 2 results', () => {
        const index = buildIndex([
          { id: 'a', title: 'A', path: 'a', body: 'route' },
          { id: 'b', title: 'B', path: 'b', body: 'route' },
          { id: 'c', title: 'C', path: 'c', body: 'route' },
        ]);

        expect(search(index, 'route', 2).length).toBe(2);
      });
    });
  });
});
