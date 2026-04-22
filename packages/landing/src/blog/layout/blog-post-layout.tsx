import { css, onMount, ref, token } from '@vertz/ui';
import { Footer } from '../../components/footer';
import { Nav } from '../../components/nav';
import { ReadingProgress } from '../components/reading-progress';
import { Toc } from '../components/toc';
import { prose } from '../styles/prose';
import type { Author, PostMeta } from '../types';
import { BlogPostHeader } from './blog-post-header';

const NAV_OFFSET = '6rem';

const s = css({
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-background)',
  },
  breadcrumb: {
    maxWidth: '1100px',
    marginInline: 'auto',
    paddingTop: NAV_OFFSET,
    paddingInline: token.spacing[4],
    paddingBottom: token.spacing[4],
  },
  breadcrumbLink: {
    display: 'inline-block',
    color: token.color.gray[400],
    fontSize: token.font.size.sm,
    textDecoration: 'none',
  },
  grid: {
    maxWidth: '1100px',
    marginInline: 'auto',
    paddingInline: token.spacing[4],
    paddingBottom: token.spacing[24],
    '@media (min-width: 1024px)': {
      display: 'grid',
      gridTemplateColumns: '1fr 640px 200px',
      gap: '2rem',
    },
  },
  gutter: {
    display: 'none',
    '@media (min-width: 1024px)': { display: 'block' },
  },
  body: {
    maxWidth: '640px',
    marginInline: 'auto',
    color: token.color.gray[200],
    '@media (min-width: 1024px)': { maxWidth: '100%' },
  },
  tocColumn: {
    display: 'none',
    '@media (min-width: 1024px)': { display: 'block' },
  },
});

export interface BlogPostLayoutProps {
  meta: PostMeta;
  author: Author | null;
  /** Pre-rendered MDX body HTML. Injected via `innerHTML` on the article. */
  html: string;
}

export function BlogPostLayout({ meta, author, html }: BlogPostLayoutProps) {
  const articleRef = ref<HTMLElement>();
  const tocHostRef = ref<HTMLDivElement>();
  const progressHostRef = ref<HTMLDivElement>();

  // Mount the progress bar + TOC imperatively once the article element is
  // attached. Both components expect an HTMLElement target, which only
  // exists after the DOM is live — `onMount` runs client-side only.
  onMount(() => {
    if (typeof window === 'undefined') return;
    const article = articleRef.current;
    const progressHost = progressHostRef.current;
    const tocHost = tocHostRef.current;
    if (!article) return;

    const cleanups: Array<() => void> = [];

    if (progressHost) {
      const bar = ReadingProgress({ target: article });
      progressHost.appendChild(bar);
      cleanups.push(() => {
        if ('remove' in bar && typeof bar.remove === 'function') bar.remove();
      });
    }

    if (tocHost) {
      const tocEl = Toc({ html, target: article });
      tocHost.appendChild(tocEl);
      cleanups.push(() => {
        if ('remove' in tocEl && typeof tocEl.remove === 'function') tocEl.remove();
      });
    }

    return () => {
      for (const c of cleanups) c();
    };
  });

  return (
    <div className={s.page}>
      <div ref={progressHostRef} />
      <Nav />
      <div className={s.breadcrumb}>
        <a href="/blog" className={s.breadcrumbLink}>
          ← Blog
        </a>
      </div>
      <div className={s.grid}>
        <div className={s.gutter} aria-hidden="true" />
        <main className={s.body}>
          <BlogPostHeader meta={meta} author={author} />
          <article ref={articleRef} className={prose.prose} innerHTML={html} />
        </main>
        <aside ref={tocHostRef} className={s.tocColumn} />
      </div>
      <Footer />
    </div>
  );
}
