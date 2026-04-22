import { css } from '@vertz/ui';
import { useParams } from '@vertz/ui/router';
import { BlogPostLayout } from '../../blog/layout/blog-post-layout';
import { getPostBySlug, loadAuthor } from '../../blog/load-posts';
import { Footer } from '../../components/footer';
import { Nav } from '../../components/nav';

const notFound = css({
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  container: {
    maxWidth: '640px',
    marginInline: 'auto',
    paddingInline: '1rem',
    paddingTop: '8rem',
    paddingBottom: '6rem',
    flex: '1',
  },
  back: { display: 'inline-block', color: 'var(--color-muted-foreground)' },
  title: { fontSize: '2rem', marginBlock: '1rem' },
  body: { color: 'var(--color-muted-foreground)' },
});

export function BlogPostPage() {
  const { slug } = useParams<'/blog/:slug'>();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <div className={notFound.page}>
        <Nav />
        <div className={notFound.container}>
          <a href="/blog" className={notFound.back}>
            ← Blog
          </a>
          <h1 className={notFound.title}>Post not found</h1>
          <p className={notFound.body}>
            There's no blog post at <code>/blog/{slug}</code>.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  const author = loadAuthor(post.meta.author);
  return <BlogPostLayout meta={post.meta} author={author} html={post.html} />;
}
