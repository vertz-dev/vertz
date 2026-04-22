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

export type PostComponent = (
  props?: Record<string, unknown>,
) => HTMLElement | SVGElement | DocumentFragment;

export interface LoadedPost {
  meta: PostMeta;
  Component: PostComponent;
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

export interface GeneratedPost {
  slug: string;
  frontmatter: RawFrontmatter;
  wordCount: number;
  Component: PostComponent;
}

export type AuthorManifest = Record<string, Omit<Author, 'key'>>;
