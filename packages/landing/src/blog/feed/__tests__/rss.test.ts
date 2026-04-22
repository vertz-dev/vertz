import { describe, expect, it } from '@vertz/test';
import { buildRssFeed, toRfc822 } from '../rss';
import type { LoadedPost } from '../../types';

function makePost(overrides: Partial<LoadedPost['meta']> & { slug: string }): LoadedPost {
  return {
    meta: {
      slug: overrides.slug,
      title: overrides.title ?? 'Sample',
      date: overrides.date ?? '2026-04-22',
      author: overrides.author ?? 'matheus',
      tags: overrides.tags ?? [],
      description: overrides.description ?? 'Desc',
      draft: overrides.draft ?? false,
      readingTime: 3,
    },
    html: '<p>body</p>',
  };
}

describe('Feature: RSS feed', () => {
  describe('Given no posts', () => {
    describe('When buildRssFeed runs', () => {
      it('then returns a well-formed channel with zero items', () => {
        const xml = buildRssFeed([], { siteUrl: 'https://vertz.dev' });
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<rss version="2.0"');
        expect(xml).toContain('<link>https://vertz.dev/blog</link>');
        expect(xml).not.toContain('<item>');
      });
    });
  });

  describe('Given a single post', () => {
    describe('When buildRssFeed runs', () => {
      it('then it appears once as an <item>', () => {
        const xml = buildRssFeed([makePost({ slug: 'hello' })], { siteUrl: 'https://vertz.dev' });
        expect(xml.match(/<item>/g)?.length).toBe(1);
      });

      it('then the item link points at the absolute post URL', () => {
        const xml = buildRssFeed([makePost({ slug: 'hello' })], { siteUrl: 'https://vertz.dev' });
        expect(xml).toContain('<link>https://vertz.dev/blog/hello</link>');
      });

      it('then the pubDate is RFC 822 formatted', () => {
        const xml = buildRssFeed([makePost({ slug: 'hello', date: '2026-04-22' })], {
          siteUrl: 'https://vertz.dev',
        });
        // RFC 822 has a weekday + day + month + year + time + zone, e.g. "Wed, 22 Apr 2026 00:00:00 GMT"
        expect(xml).toMatch(
          /<pubDate>(Mon|Tue|Wed|Thu|Fri|Sat|Sun), 22 Apr 2026 00:00:00 GMT<\/pubDate>/,
        );
      });

      it('then each tag renders as a <category>', () => {
        const xml = buildRssFeed([makePost({ slug: 'a', tags: ['framework', 'dx'] })], {
          siteUrl: 'https://vertz.dev',
        });
        expect(xml).toContain('<category>framework</category>');
        expect(xml).toContain('<category>dx</category>');
      });

      it('then the description is XML-escaped', () => {
        const xml = buildRssFeed([makePost({ slug: 'a', description: 'Code: x < y & z > 0' })], {
          siteUrl: 'https://vertz.dev',
        });
        expect(xml).toContain('<description>Code: x &lt; y &amp; z &gt; 0</description>');
      });
    });
  });

  describe('Given more than 20 posts', () => {
    describe('When buildRssFeed runs', () => {
      it('then only the 20 newest are kept', () => {
        const posts: LoadedPost[] = Array.from({ length: 30 }, (_, i) =>
          makePost({ slug: `post-${i}` }),
        );
        const xml = buildRssFeed(posts, { siteUrl: 'https://vertz.dev' });
        expect(xml.match(/<item>/g)?.length).toBe(20);
      });
    });
  });

  describe('Given a post with draft: true', () => {
    describe('When buildRssFeed runs', () => {
      it('then the draft is excluded from the feed', () => {
        const posts = [makePost({ slug: 'published' }), makePost({ slug: 'draft', draft: true })];
        const xml = buildRssFeed(posts, { siteUrl: 'https://vertz.dev' });
        expect(xml).toContain('/blog/published');
        expect(xml).not.toContain('/blog/draft');
      });
    });
  });
});

describe('Feature: toRfc822', () => {
  describe('Given an ISO date', () => {
    describe('When toRfc822 runs', () => {
      it('then it returns an RFC-822 GMT-zoned timestamp', () => {
        expect(toRfc822('2026-04-22')).toMatch(
          /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), 22 Apr 2026 00:00:00 GMT$/,
        );
      });
    });
  });
});
