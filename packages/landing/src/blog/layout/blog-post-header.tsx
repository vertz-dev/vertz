import { css, token } from '@vertz/ui';
import type { Author, PostMeta } from '../types';

const s = css({
  header: {
    marginBottom: token.spacing[10],
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: token.spacing[2],
    marginBottom: token.spacing[4],
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: token.color.orange[400],
  },
  title: {
    fontFamily: "'DM Serif Display', 'DM Serif Display Fallback', serif",
    fontSize: '2.75rem',
    lineHeight: '1.1',
    textWrap: 'balance',
    color: token.color.gray[100],
    margin: '0 0 1rem 0',
  },
  description: {
    fontSize: '17px',
    lineHeight: '1.6',
    color: token.color.gray[400],
    margin: `0 0 ${token.spacing[6]} 0`,
    textWrap: 'pretty',
  },
  authorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    fontSize: token.font.size.sm,
    color: token.color.gray[400],
    marginBottom: token.spacing[8],
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  authorText: { color: token.color.gray[300] },
  cover: {
    display: 'block',
    width: '100%',
    maxWidth: '800px',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: token.radius.lg,
    marginTop: token.spacing[4],
  },
});

function formatDate(iso: string): string {
  // `2026-04-22` → `Apr 22, 2026`
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

export interface BlogPostHeaderProps {
  meta: PostMeta;
  /** Resolved author. `null` means the author key didn't match any JSON file. */
  author: Author | null;
}

export function BlogPostHeader({ meta, author }: BlogPostHeaderProps) {
  const authorDisplay = author?.name ?? meta.author;

  return (
    <header className={s.header}>
      {meta.tags.length > 0 && (
        <div data-tag-row className={s.tagRow}>
          {meta.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      <h1 className={s.title}>{meta.title}</h1>
      <p className={s.description}>{meta.description}</p>
      <div className={s.authorRow}>
        {author?.avatar && (
          <img data-avatar src={author.avatar} alt={authorDisplay} className={s.avatar} />
        )}
        <span className={s.authorText}>{authorDisplay}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDate(meta.date)}</span>
        <span aria-hidden="true">·</span>
        <span>{meta.readingTime} min read</span>
      </div>
      {meta.cover && (
        <img
          data-cover
          src={meta.cover}
          alt={`${meta.title} — cover`}
          className={s.cover}
          loading="lazy"
        />
      )}
    </header>
  );
}
