import { css, token } from '@vertz/ui';
import type { LoadedPost } from '../types';

// ── Pure helpers (tested in isolation) ────────────────────────

export function collectTags(posts: LoadedPost[]): string[] {
  const seen = new Set<string>();
  for (const p of posts) for (const t of p.meta.tags) seen.add(t);
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export function filterPostsByTag(posts: LoadedPost[], tag: string | null): LoadedPost[] {
  if (tag === null) return posts;
  return posts.filter((p) => p.meta.tags.includes(tag));
}

// ── Component ─────────────────────────────────────────────────

const s = css({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: token.spacing[2],
    marginBottom: token.spacing[8],
  },
  pill: {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'transparent',
    color: token.color.gray[400],
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[1],
    borderRadius: token.radius.full,
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
      color: token.color.gray[200],
      borderColor: 'rgba(255,255,255,0.2)',
    },
  },
  pillActive: {
    color: token.color.background,
    backgroundColor: token.color.gray[100],
    borderColor: token.color.gray[100],
    '&:hover': {
      color: token.color.background,
      borderColor: token.color.gray[100],
    },
  },
});

export interface TagFilterProps {
  tags: string[];
  activeTag: string | null;
  onChange: (tag: string | null) => void;
}

export function TagFilter({ tags, activeTag, onChange }: TagFilterProps) {
  if (tags.length === 0) return <></>;
  return (
    <div className={s.row} role="group" aria-label="Filter posts by tag">
      <button
        type="button"
        aria-pressed={activeTag === null ? 'true' : 'false'}
        className={activeTag === null ? `${s.pill} ${s.pillActive}` : s.pill}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-pressed={activeTag === tag ? 'true' : 'false'}
          className={activeTag === tag ? `${s.pill} ${s.pillActive}` : s.pill}
          onClick={() => onChange(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
