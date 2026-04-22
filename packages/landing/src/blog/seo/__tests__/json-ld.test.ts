import { describe, expect, it } from '@vertz/test';
import { buildBlogPostingLd } from '../json-ld';
import type { Author, PostMeta } from '../../types';

function makeMeta(overrides: Partial<PostMeta> = {}): PostMeta {
  return {
    slug: 'hello-world',
    title: 'Hello, world',
    date: '2026-04-22',
    author: 'matheus',
    tags: [],
    description: 'A post',
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

describe('Feature: buildBlogPostingLd', () => {
  describe('Given a post with a resolved author', () => {
    describe('When buildBlogPostingLd runs', () => {
      it('then the output is valid Schema.org BlogPosting', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta(),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld['@context']).toBe('https://schema.org');
        expect(ld['@type']).toBe('BlogPosting');
        expect(ld.headline).toBe('Hello, world');
        expect(ld.description).toBe('A post');
        expect(ld.datePublished).toBe('2026-04-22');
        expect(ld.mainEntityOfPage).toBe('https://vertz.dev/blog/hello-world');
      });

      it('then the author block uses Person + name + twitter URL', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta(),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.author).toEqual({
          '@type': 'Person',
          name: 'Matheus Poleza',
          url: 'https://twitter.com/matheuspoleza',
        });
      });

      it('then the publisher is Vertz with a logo', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta(),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.publisher).toEqual({
          '@type': 'Organization',
          name: 'Vertz',
          logo: { '@type': 'ImageObject', url: 'https://vertz.dev/logo.png' },
        });
      });
    });
  });

  describe('Given no resolved author', () => {
    describe('When buildBlogPostingLd runs', () => {
      it('then the author key is used as the Person name', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta({ author: 'unknown' }),
          author: null,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.author).toEqual({ '@type': 'Person', name: 'unknown' });
      });
    });
  });

  describe('Given a post with a cover', () => {
    describe('When buildBlogPostingLd runs', () => {
      it('then the cover URL is absolutized against siteUrl', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta({ cover: '/blog/covers/hello.png' }),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.image).toBe('https://vertz.dev/blog/covers/hello.png');
      });
    });
  });

  describe('Given a post with an absolute cover URL', () => {
    describe('When buildBlogPostingLd runs', () => {
      it('then the URL is preserved as-is', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta({ cover: 'https://cdn.example.com/cover.png' }),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.image).toBe('https://cdn.example.com/cover.png');
      });
    });
  });

  describe('Given a post without a cover', () => {
    describe('When buildBlogPostingLd runs', () => {
      it('then image points at the auto-generated OG path', () => {
        const ld = buildBlogPostingLd({
          meta: makeMeta({ cover: undefined }),
          author: matheus,
          siteUrl: 'https://vertz.dev',
        });
        expect(ld.image).toBe('https://vertz.dev/blog/og/hello-world.png');
      });
    });
  });
});
