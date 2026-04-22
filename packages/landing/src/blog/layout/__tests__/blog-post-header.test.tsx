import { describe, expect, it } from '@vertz/test';
import { BlogPostHeader } from '../blog-post-header';
import type { Author, PostMeta } from '../../types';

function makeMeta(overrides: Partial<PostMeta> = {}): PostMeta {
  return {
    slug: 'hello-world',
    title: 'Hello, world',
    date: '2026-04-22',
    author: 'matheus',
    tags: ['meta', 'dx'],
    description: 'A post description.',
    cover: '/blog/covers/hello.png',
    draft: false,
    readingTime: 3,
    ...overrides,
  };
}

const matheus: Author = {
  key: 'matheus',
  name: 'Matheus Poleza',
  avatar: '/blog/authors/matheus.jpg',
  bio: 'Building Vertz.',
  twitter: '@matheuspoleza',
};

describe('Feature: BlogPostHeader', () => {
  describe('Given a PostMeta with every field and an Author', () => {
    describe('When BlogPostHeader renders', () => {
      it('then the post title appears in the DOM', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        expect(el.textContent).toContain('Hello, world');
      });

      it('then the description appears in the DOM', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        expect(el.textContent).toContain('A post description.');
      });

      it('then every tag appears in the DOM', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        expect(el.textContent).toContain('meta');
        expect(el.textContent).toContain('dx');
      });

      it('then the author name appears in the DOM', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        expect(el.textContent).toContain('Matheus Poleza');
      });

      it('then the reading time appears in the DOM', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        expect(el.textContent).toMatch(/3 min read/);
      });

      it('then the cover image renders with the frontmatter src', () => {
        const el = BlogPostHeader({ meta: makeMeta(), author: matheus });
        const img = el.querySelector('img[data-cover]');
        expect(img?.getAttribute('src')).toBe('/blog/covers/hello.png');
      });
    });
  });

  describe('Given a PostMeta without a cover', () => {
    describe('When BlogPostHeader renders', () => {
      it('then no <img data-cover> tag is emitted', () => {
        const meta = makeMeta({ cover: undefined });
        const el = BlogPostHeader({ meta, author: matheus });
        expect(el.querySelector('img[data-cover]')).toBeNull();
      });
    });
  });

  describe('Given a PostMeta with no tags', () => {
    describe('When BlogPostHeader renders', () => {
      it('then no tag row appears (no tags text leaks in)', () => {
        const meta = makeMeta({ tags: [] });
        const el = BlogPostHeader({ meta, author: matheus });
        expect(el.querySelector('[data-tag-row]')).toBeNull();
      });
    });
  });

  describe('Given no resolved author (unknown author key)', () => {
    describe('When BlogPostHeader renders', () => {
      it('then the meta.author key is shown instead of crashing', () => {
        const meta = makeMeta({ author: 'unknown-user' });
        const el = BlogPostHeader({ meta, author: null });
        expect(el.textContent).toContain('unknown-user');
      });
    });
  });
});
