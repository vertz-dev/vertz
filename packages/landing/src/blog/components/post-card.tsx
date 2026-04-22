import { css, token } from '@vertz/ui';
import type { PostMeta } from '../types';

const s = css({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[3],
    color: 'inherit',
    textDecoration: 'none',
    transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { transform: 'translateY(-2px)' },
    '&:hover [data-card-title]': { color: token.color.gray[100] },
  },
  coverWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: token.radius.lg,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cover: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  coverFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'DM Serif Display', 'DM Serif Display Fallback', serif",
    fontSize: '2rem',
    color: token.color.gray[500],
    background: 'linear-gradient(135deg, rgba(200,69,27,0.12), rgba(30,30,28,1))',
  },
  tagRow: {
    display: 'flex',
    gap: token.spacing[2],
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: token.color.orange[400],
  },
  title: {
    fontFamily: "'DM Sans', 'DM Sans Fallback', sans-serif",
    fontSize: '1.25rem',
    fontWeight: '600',
    lineHeight: '1.35',
    textWrap: 'balance',
    color: token.color.gray[200],
    margin: 0,
    transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  meta: {
    display: 'flex',
    gap: token.spacing[2],
    fontSize: token.font.size.xs,
    color: token.color.gray[500],
  },
});

function formatDate(iso: string): string {
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

function coverInitial(title: string): string {
  const first = title.trim().charAt(0);
  return first ? first.toUpperCase() : '✱';
}

export interface PostCardProps {
  meta: PostMeta;
}

export function PostCard({ meta }: PostCardProps) {
  const firstTag = meta.tags[0];
  return (
    <a href={`/blog/${meta.slug}`} className={s.card} data-tags={meta.tags.join(' ') || undefined}>
      <div className={s.coverWrap}>
        {meta.cover ? (
          <img
            data-cover
            src={meta.cover}
            alt={`${meta.title} — cover`}
            className={s.cover}
            loading="lazy"
          />
        ) : (
          <div className={s.coverFallback} aria-hidden="true">
            {coverInitial(meta.title)}
          </div>
        )}
      </div>
      {meta.tags.length > 0 && (
        <div data-tag-row className={s.tagRow}>
          <span>{firstTag}</span>
        </div>
      )}
      <h2 data-card-title className={s.title}>
        {meta.title}
      </h2>
      <div className={s.meta}>
        <span>{formatDate(meta.date)}</span>
        <span aria-hidden="true">·</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </a>
  );
}
