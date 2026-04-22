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
  notFoundTitle: { fontSize: token.font.size['2xl'], marginBottom: token.spacing[4] },
  notFoundBody: { color: token.color.gray[400] },
});

export function BlogPostPage() {
  const { slug } = useParams<'/blog/:slug'>();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <main className={s.page}>
        <div className={s.container}>
          <a href="/blog" className={s.back}>
            ← Blog
          </a>
          <h1 className={s.notFoundTitle}>Post not found</h1>
          <p className={s.notFoundBody}>
            There's no blog post at <code>/blog/{slug}</code>.
          </p>
        </div>
      </main>
    );
  }

  const Post = post.Component;
  return (
    <main className={s.page}>
      <div className={s.container}>
        <a href="/blog" className={s.back}>
          ← Blog
        </a>
        <Post />
      </div>
    </main>
  );
}
