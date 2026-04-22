import { css, token } from '@vertz/ui';
import { BlogListHeader } from '../../blog/components/blog-list-header';
import { PostCard } from '../../blog/components/post-card';
import { TagFilter, collectTags, filterPostsByTag } from '../../blog/components/tag-filter';
import { getAllPosts } from '../../blog/load-posts';
import { Footer } from '../../components/footer';
import { Nav } from '../../components/nav';

const s = css({
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-background)',
    display: 'flex',
    flexDirection: 'column',
  },
  container: {
    maxWidth: '1040px',
    marginInline: 'auto',
    paddingTop: '8rem',
    paddingBottom: token.spacing[24],
    paddingInline: token.spacing[4],
    width: '100%',
    flex: '1',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '2rem',
    '@media (min-width: 768px)': {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  empty: {
    color: token.color.gray[500],
    fontSize: token.font.size.sm,
  },
});

export function BlogListPage() {
  const posts = getAllPosts();
  const tags = collectTags(posts);

  // Local state for the client-side tag filter. Compiler rewrites `let` +
  // reassignment into a signal so the grid reactively re-filters without
  // a route change.
  let activeTag: string | null = null as string | null;

  const visible = filterPostsByTag(posts, activeTag);

  return (
    <div className={s.page}>
      <Nav />
      <main className={s.container}>
        <BlogListHeader />
        <TagFilter
          tags={tags}
          activeTag={activeTag}
          onChange={(next) => {
            activeTag = next;
          }}
        />
        {visible.length === 0 ? (
          <p className={s.empty}>No posts yet.</p>
        ) : (
          <div className={s.grid}>
            {visible.map((post) => (
              <PostCard key={post.meta.slug} meta={post.meta} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
