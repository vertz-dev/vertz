import { css, token } from '@vertz/ui';
import { useParams } from '@vertz/ui/router';
import { getPostBySlug } from '../../blog/load-posts';

const s = css({
  page: { minHeight: '100vh', paddingBlock: token.spacing[20] },
  container: {
    maxWidth: '720px',
    marginInline: 'auto',
    paddingInline: token.spacing[6],
  },
  back: {
    display: 'inline-block',
    color: token.color.gray[400],
    marginBottom: token.spacing[6],
    textDecoration: 'none',
  },
  body: { color: token.color.gray[100] },
  notFoundTitle: { fontSize: token.font.size['2xl'], marginBottom: token.spacing[4] },
  notFoundBody: { color: token.color.gray[400] },
});

// Phase 1 uses a text arrow for the back link rather than `@vertz/icons` —
// the @vertz/ui SSR pipeline serializes icon HTMLSpanElements as
// "[object Object]" today. Phase 2's layout pass is the right place to
// resolve icon SSR holistically.
function BackToBlog() {
  return (
    <a href="/blog" className={s.back}>
      ← Blog
    </a>
  );
}

export function BlogPostPage() {
  const { slug } = useParams<'/blog/:slug'>();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <main className={s.page}>
        <div className={s.container}>
          <BackToBlog />
          <h1 className={s.notFoundTitle}>Post not found</h1>
          <p className={s.notFoundBody}>
            There's no blog post at <code>/blog/{slug}</code>.
          </p>
        </div>
      </main>
    );
  }

  // The generator pre-renders every `.mdx` to an HTML string; inject it via
  // `innerHTML` so the Vertz SSR serializer can embed the pre-rendered body
  // directly without trying to mix an external JSX tree into its own.
  return (
    <main className={s.page}>
      <div className={s.container}>
        <BackToBlog />
        <article className={s.body} innerHTML={post.html} />
      </div>
    </main>
  );
}
