import { css, token } from '@vertz/ui';
import { getAllPosts } from '../../blog/load-posts';

const s = css({
  page: { minHeight: '100vh', paddingBlock: token.spacing[20] },
  container: {
    maxWidth: '720px',
    marginInline: 'auto',
    paddingInline: token.spacing[6],
  },
  title: { fontSize: token.font.size['3xl'], marginBottom: token.spacing[8] },
  list: { listStyle: 'none', padding: 0 },
  item: { marginBottom: token.spacing[4] },
  link: {
    color: token.color.gray[100],
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  empty: { color: token.color.gray[400] },
});

export function BlogListPage() {
  const posts = getAllPosts();

  return (
    <main className={s.page}>
      <div className={s.container}>
        <h1 className={s.title}>Blog</h1>
        {posts.length === 0 ? (
          <p className={s.empty}>No posts yet.</p>
        ) : (
          <ul className={s.list}>
            {posts.map((post) => (
              <li key={post.meta.slug} className={s.item}>
                <a href={`/blog/${post.meta.slug}`} className={s.link}>
                  {post.meta.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
