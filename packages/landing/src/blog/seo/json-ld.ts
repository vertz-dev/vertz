import type { Author, PostMeta } from '../types';

export interface BlogPostingLd {
  '@context': 'https://schema.org';
  '@type': 'BlogPosting';
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  author: {
    '@type': 'Person';
    name: string;
    url?: string;
  };
  publisher: {
    '@type': 'Organization';
    name: 'Vertz';
    logo: { '@type': 'ImageObject'; url: string };
  };
  mainEntityOfPage: string;
}

export interface BlogPostingLdInput {
  meta: PostMeta;
  author: Author | null;
  siteUrl: string;
}

function absolutize(url: string | undefined, siteUrl: string, fallback: string): string {
  const resolved = url ?? fallback;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  return `${siteUrl.replace(/\/+$/, '')}${resolved.startsWith('/') ? '' : '/'}${resolved}`;
}

export function buildBlogPostingLd({ meta, author, siteUrl }: BlogPostingLdInput): BlogPostingLd {
  const base = siteUrl.replace(/\/+$/, '');
  const postUrl = `${base}/blog/${meta.slug}`;
  const fallbackOg = `/blog/og/${meta.slug}.png`;
  const image = absolutize(meta.cover, siteUrl, fallbackOg);

  const authorBlock: BlogPostingLd['author'] = author
    ? {
        '@type': 'Person',
        name: author.name,
        url: `https://twitter.com/${author.twitter.replace(/^@/, '')}`,
      }
    : { '@type': 'Person', name: meta.author };

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    description: meta.description,
    image,
    datePublished: meta.date,
    author: authorBlock,
    publisher: {
      '@type': 'Organization',
      name: 'Vertz',
      logo: { '@type': 'ImageObject', url: `${base}/logo.png` },
    },
    mainEntityOfPage: postUrl,
  };
}
