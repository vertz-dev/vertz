import { describe, expect, it } from '@vertz/test';
import {
  buildPosts,
  computeReadingTime,
  filterDrafts,
  sortByDateDesc,
  toPostMeta,
} from '../load-posts';
import type { GeneratedPost, LoadedPost } from '../types';

const stubComponent = (): DocumentFragment => document.createDocumentFragment();

function makeGen(overrides: Partial<GeneratedPost> & { slug: string }): GeneratedPost {
  return {
    slug: overrides.slug,
    wordCount: overrides.wordCount ?? 200,
    Component: overrides.Component ?? stubComponent,
    frontmatter: {
      title: 'Sample',
      date: '2026-04-22',
      author: 'matheus',
      description: 'Desc',
      ...overrides.frontmatter,
    },
  };
}

function makeLoaded(slug: string, date: string, draft = false): LoadedPost {
  return {
    meta: {
      slug,
      title: 'T',
      date,
      author: 'matheus',
      tags: [],
      description: 'D',
      draft,
      readingTime: 1,
    },
    Component: stubComponent,
  };
}

describe('Feature: Blog post loader', () => {
  describe('Given a GeneratedPost with frontmatter and wordCount', () => {
    describe('When toPostMeta is called', () => {
      it('then returns a PostMeta with the frontmatter fields mapped', () => {
        const gen = makeGen({
          slug: '2026-04-22-hello',
          wordCount: 440,
          frontmatter: {
            title: 'Hello',
            date: '2026-04-22',
            author: 'matheus',
            description: 'A post',
            tags: ['dx', 'framework'],
            draft: false,
            cover: '/blog/covers/hello.png',
          },
        });
        const meta = toPostMeta(gen);
        expect(meta.slug).toBe('2026-04-22-hello');
        expect(meta.title).toBe('Hello');
        expect(meta.date).toBe('2026-04-22');
        expect(meta.author).toBe('matheus');
        expect(meta.tags).toEqual(['dx', 'framework']);
        expect(meta.description).toBe('A post');
        expect(meta.cover).toBe('/blog/covers/hello.png');
        expect(meta.draft).toBe(false);
      });

      it('then frontmatter.slug override wins over filename slug', () => {
        const gen = makeGen({
          slug: 'filename-slug',
          frontmatter: {
            title: 'T',
            slug: 'custom-slug',
            date: '2026-04-22',
            author: 'matheus',
            description: 'D',
          },
        });
        expect(toPostMeta(gen).slug).toBe('custom-slug');
      });

      it('then missing tags defaults to empty array', () => {
        const gen = makeGen({
          slug: 's',
          frontmatter: {
            title: 'T',
            date: '2026-04-22',
            author: 'matheus',
            description: 'D',
          },
        });
        expect(toPostMeta(gen).tags).toEqual([]);
      });

      it('then missing draft defaults to false', () => {
        const gen = makeGen({
          slug: 's',
          frontmatter: {
            title: 'T',
            date: '2026-04-22',
            author: 'matheus',
            description: 'D',
          },
        });
        expect(toPostMeta(gen).draft).toBe(false);
      });
    });
  });

  describe('Given a wordCount', () => {
    describe('When computeReadingTime is called', () => {
      it('then a 440-word post maps to 2 minutes at 220 wpm', () => {
        expect(computeReadingTime(440)).toBe(2);
      });

      it('then a 100-word post maps to 1 minute (floor clamped)', () => {
        expect(computeReadingTime(100)).toBe(1);
      });

      it('then 0 words returns 0', () => {
        expect(computeReadingTime(0)).toBe(0);
      });

      it('then 2200 words maps to 10 minutes', () => {
        expect(computeReadingTime(2200)).toBe(10);
      });
    });
  });

  describe('Given a mixed list of drafts and published posts', () => {
    describe('When filterDrafts runs with env="production"', () => {
      it('then drafts are removed', () => {
        const posts = [
          makeLoaded('a', '2026-04-20', false),
          makeLoaded('b', '2026-04-21', true),
          makeLoaded('c', '2026-04-22', false),
        ];
        const out = filterDrafts(posts, 'production');
        expect(out.map((p) => p.meta.slug)).toEqual(['a', 'c']);
      });
    });

    describe('When filterDrafts runs with env="development"', () => {
      it('then drafts are included', () => {
        const posts = [makeLoaded('a', '2026-04-20', false), makeLoaded('b', '2026-04-21', true)];
        const out = filterDrafts(posts, 'development');
        expect(out.map((p) => p.meta.slug)).toEqual(['a', 'b']);
      });
    });
  });

  describe('Given posts with unordered dates', () => {
    describe('When sortByDateDesc is called', () => {
      it('then posts are sorted by date descending', () => {
        const posts = [
          makeLoaded('a', '2026-04-18'),
          makeLoaded('b', '2026-04-22'),
          makeLoaded('c', '2026-04-20'),
        ];
        const out = sortByDateDesc(posts);
        expect(out.map((p) => p.meta.slug)).toEqual(['b', 'c', 'a']);
      });

      it('then the input array is not mutated', () => {
        const posts = [makeLoaded('a', '2026-04-18'), makeLoaded('b', '2026-04-22')];
        sortByDateDesc(posts);
        expect(posts.map((p) => p.meta.slug)).toEqual(['a', 'b']);
      });
    });
  });

  describe('Given a list of GeneratedPost', () => {
    describe('When buildPosts runs with env="production" and includes drafts', () => {
      it('then drafts are filtered and remaining posts are sorted by date desc', () => {
        const gens: GeneratedPost[] = [
          makeGen({
            slug: 'a',
            frontmatter: {
              title: 'A',
              date: '2026-04-18',
              author: 'matheus',
              description: 'D',
              draft: false,
            },
          }),
          makeGen({
            slug: 'b',
            frontmatter: {
              title: 'B',
              date: '2026-04-22',
              author: 'matheus',
              description: 'D',
              draft: true,
            },
          }),
          makeGen({
            slug: 'c',
            frontmatter: {
              title: 'C',
              date: '2026-04-20',
              author: 'matheus',
              description: 'D',
              draft: false,
            },
          }),
        ];
        const out = buildPosts(gens, 'production');
        expect(out.map((p) => p.meta.slug)).toEqual(['c', 'a']);
      });
    });

    describe('When buildPosts runs with env="development"', () => {
      it('then drafts are included and sorted by date desc', () => {
        const gens: GeneratedPost[] = [
          makeGen({
            slug: 'a',
            frontmatter: {
              title: 'A',
              date: '2026-04-18',
              author: 'matheus',
              description: 'D',
              draft: false,
            },
          }),
          makeGen({
            slug: 'b',
            frontmatter: {
              title: 'B',
              date: '2026-04-22',
              author: 'matheus',
              description: 'D',
              draft: true,
            },
          }),
        ];
        const out = buildPosts(gens, 'development');
        expect(out.map((p) => p.meta.slug)).toEqual(['b', 'a']);
      });
    });

    describe('When buildPosts runs', () => {
      it('then the wordCount is converted to readingTime in meta', () => {
        const gens: GeneratedPost[] = [makeGen({ slug: 'a', wordCount: 440 })];
        const out = buildPosts(gens, 'production');
        expect(out[0]?.meta.readingTime).toBe(2);
      });
    });
  });
});
