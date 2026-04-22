import type { Author, GeneratedPost, LoadedPost, PostMeta } from './types';

export const READING_WPM = 220;

export function computeReadingTime(wordCount: number, wpm = READING_WPM): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round(wordCount / wpm));
}

export function toPostMeta(gen: GeneratedPost): PostMeta {
  const fm = gen.frontmatter;
  return {
    slug: fm.slug ?? gen.slug,
    title: fm.title,
    date: fm.date,
    author: fm.author,
    tags: fm.tags ?? [],
    description: fm.description,
    cover: fm.cover,
    draft: fm.draft === true,
    readingTime: computeReadingTime(gen.wordCount),
  };
}

export function toLoadedPost(gen: GeneratedPost): LoadedPost {
  return { meta: toPostMeta(gen), html: gen.html };
}

export function filterDrafts(posts: LoadedPost[], env: string): LoadedPost[] {
  if (env === 'production') return posts.filter((p) => !p.meta.draft);
  return posts;
}

export function sortByDateDesc(posts: LoadedPost[]): LoadedPost[] {
  return [...posts].sort((a, b) => b.meta.date.localeCompare(a.meta.date));
}

export function buildPosts(gens: GeneratedPost[], env: string): LoadedPost[] {
  const all = gens.map(toLoadedPost);
  return sortByDateDesc(filterDrafts(all, env));
}

// ── Runtime loaders ──────────────────────────────────────────
// These import from the generated manifest written by
// `scripts/compile-blog-posts.ts`. Tests avoid this path by
// calling the pure helpers above directly.

import { generatedAuthors, generatedPosts } from './.generated/manifest';

function currentEnv(): string {
  const env = globalThis.process?.env?.NODE_ENV;
  return env ?? 'development';
}

export function getAllPosts(): LoadedPost[] {
  return buildPosts(generatedPosts, currentEnv());
}

export function getPostBySlug(slug: string): LoadedPost | null {
  return getAllPosts().find((p) => p.meta.slug === slug) ?? null;
}

export function loadAuthor(key: string): Author | null {
  const a = generatedAuthors[key];
  if (!a) return null;
  return { key, ...a };
}
