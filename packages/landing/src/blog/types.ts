export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  author: string;
  tags: string[];
  description: string;
  cover?: string;
  draft: boolean;
  readingTime: number;
}

export interface Author {
  key: string;
  name: string;
  avatar: string;
  bio: string;
  twitter: string;
}

/**
 * A post as the generator wrote it into `.generated/manifest.ts` — frontmatter
 * extracted via `@vertz/mdx` + `remark-mdx-frontmatter`, body pre-rendered to
 * HTML so the Vertz SSR serializer can inject it via `innerHTML` without
 * trying to mix an external `DocumentFragment` into its own tree.
 */
export interface GeneratedPost {
  slug: string;
  frontmatter: RawFrontmatter;
  wordCount: number;
  html: string;
}

/** A loaded post ready for rendering. */
export interface LoadedPost {
  meta: PostMeta;
  html: string;
}

export interface RawFrontmatter {
  title: string;
  slug?: string;
  date: string;
  author: string;
  tags?: string[];
  description: string;
  cover?: string;
  draft?: boolean;
}

export type AuthorManifest = Record<string, Omit<Author, 'key'>>;
