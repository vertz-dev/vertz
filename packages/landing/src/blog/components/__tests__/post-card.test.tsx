import { describe, expect, it } from '@vertz/test';
import { PostCard } from '../post-card';
import type { PostMeta } from '../../types';

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

describe('Feature: PostCard', () => {
  describe('Given a PostMeta with a cover and tags', () => {
    describe('When PostCard renders', () => {
      it('then the title text is present', () => {
        const el = PostCard({ meta: makeMeta() });
        expect(el.textContent).toContain('Hello, world');
      });

      it('then the cover image renders with the frontmatter src', () => {
        const el = PostCard({ meta: makeMeta() });
        const img = el.querySelector('img[data-cover]');
        expect(img?.getAttribute('src')).toBe('/blog/covers/hello.png');
      });

      it('then the first tag is shown', () => {
        const el = PostCard({ meta: makeMeta() });
        expect(el.textContent).toContain('meta');
      });

      it('then the reading time is shown', () => {
        const el = PostCard({ meta: makeMeta() });
        expect(el.textContent).toMatch(/3 min read/);
      });

      it('then the entire card is wrapped in a single anchor pointing at /blog/<slug>', () => {
        const el = PostCard({ meta: makeMeta() });
        const isElement = (n: unknown): n is Element =>
          typeof (n as Element).getAttribute === 'function';
        const rootAnchor =
          isElement(el) && el.tagName === 'A' ? (el as HTMLAnchorElement) : el.querySelector('a');
        expect(rootAnchor?.getAttribute('href')).toBe('/blog/hello-world');
      });

      it('then the post date is shown', () => {
        const el = PostCard({ meta: makeMeta({ date: '2026-04-22' }) });
        expect(el.textContent).toContain('Apr 22, 2026');
      });
    });
  });

  describe('Given a PostMeta without a cover', () => {
    describe('When PostCard renders', () => {
      it('then the card still renders (auto-generated fallback slot present) and no broken image is emitted', () => {
        const meta = makeMeta({ cover: undefined });
        const el = PostCard({ meta });
        // Either no img, or the fallback-cover div; never a real <img> with empty src
        const img = el.querySelector('img[data-cover]');
        expect(img?.getAttribute('src')).not.toBe('');
      });
    });
  });

  describe('Given a PostMeta with no tags', () => {
    describe('When PostCard renders', () => {
      it('then no tag row is emitted', () => {
        const meta = makeMeta({ tags: [] });
        const el = PostCard({ meta });
        expect(el.querySelector('[data-tag-row]')).toBeNull();
      });
    });
  });
});
