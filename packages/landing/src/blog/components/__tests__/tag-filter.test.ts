import { describe, expect, it } from '@vertz/test';
import { collectTags, filterPostsByTag } from '../tag-filter';
import type { LoadedPost } from '../../types';

function makePost(slug: string, tags: string[]): LoadedPost {
  return {
    meta: {
      slug,
      title: slug,
      date: '2026-04-22',
      author: 'matheus',
      tags,
      description: 'D',
      draft: false,
      readingTime: 1,
    },
    html: '',
  };
}

describe('Feature: Tag filter', () => {
  describe('Given a set of posts with overlapping tags', () => {
    describe('When collectTags runs', () => {
      it('then it returns a de-duplicated sorted list', () => {
        const posts = [
          makePost('a', ['framework', 'ai']),
          makePost('b', ['framework', 'dx']),
          makePost('c', ['compiler']),
        ];
        expect(collectTags(posts)).toEqual(['ai', 'compiler', 'dx', 'framework']);
      });
    });

    describe('When collectTags runs on an empty list', () => {
      it('then it returns an empty array', () => {
        expect(collectTags([])).toEqual([]);
      });
    });

    describe('When collectTags runs on posts with no tags', () => {
      it('then it returns an empty array', () => {
        expect(collectTags([makePost('a', []), makePost('b', [])])).toEqual([]);
      });
    });
  });

  describe('Given filterPostsByTag', () => {
    describe('When tag is null', () => {
      it('then every post is returned', () => {
        const posts = [makePost('a', ['framework']), makePost('b', ['ai'])];
        expect(filterPostsByTag(posts, null).map((p) => p.meta.slug)).toEqual(['a', 'b']);
      });
    });

    describe('When tag matches one post', () => {
      it('then only posts carrying the tag are returned', () => {
        const posts = [
          makePost('a', ['framework']),
          makePost('b', ['ai']),
          makePost('c', ['framework', 'ai']),
        ];
        expect(filterPostsByTag(posts, 'framework').map((p) => p.meta.slug)).toEqual(['a', 'c']);
      });
    });

    describe('When tag matches no posts', () => {
      it('then an empty array is returned', () => {
        const posts = [makePost('a', ['framework'])];
        expect(filterPostsByTag(posts, 'nonexistent')).toEqual([]);
      });
    });
  });
});
