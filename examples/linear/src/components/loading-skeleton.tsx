import { css, token } from '@vertz/ui';
import { skeletonAnimation, skeletonStyles } from '../styles/components';

// ── Board skeleton ──────────────────────────────────────────

const boardStyles = css({
  container: { display: 'flex', gap: token.spacing[4] },
  column: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: token.spacing[64],
    width: token.spacing[64],
    flexShrink: '0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing[2],
    marginBottom: token.spacing[2],
  },
});

export function BoardSkeleton() {
  return (
    <div className={boardStyles.container} data-testid="board-skeleton">
      {[0, 1, 2, 3].map((col) => (
        <div className={boardStyles.column} key={col}>
          <div className={boardStyles.header}>
            <div
              className={skeletonStyles.bone}
              style={{ width: '5rem', height: '1rem', ...skeletonAnimation }}
            />
          </div>
          {[0, 1, 2].map((card) => (
            <div key={card} className={skeletonStyles.card} style={skeletonAnimation} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Issue list skeleton ─────────────────────────────────────

const listStyles = css({
  container: {
    borderWidth: '1px',
    borderColor: token.color.border,
    borderRadius: token.radius.lg,
    overflow: 'hidden',
  },
  row: { padding: token.spacing[3], borderBottomWidth: '1px', borderColor: token.color.border },
});

export function IssueListSkeleton() {
  return (
    <div className={listStyles.container} data-testid="list-skeleton">
      {[0, 1, 2, 3, 4].map((i) => (
        <div className={listStyles.row} key={i}>
          <div className={skeletonStyles.lineShort} style={skeletonAnimation} />
          <div className={skeletonStyles.line} style={skeletonAnimation} />
        </div>
      ))}
    </div>
  );
}

// ── Project grid skeleton ───────────────────────────────────

const gridStyles = css({
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    gap: token.spacing[3],
  },
});

export function ProjectGridSkeleton() {
  return (
    <div className={gridStyles.container} data-testid="projects-skeleton">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={skeletonStyles.card}
          style={{ height: '5rem', ...skeletonAnimation }}
        />
      ))}
    </div>
  );
}

// ── Issue detail skeleton ───────────────────────────────────

const detailStyles = css({
  layout: { display: 'flex', gap: token.spacing[8] },
  main: { flex: '1 1 0%' },
  sidebar: { width: token.spacing[56], flexShrink: '0' },
});

// ── Auth loading skeleton (ProtectedRoute fallback) ─────

const authStyles = css({
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
});

export function AuthLoadingSkeleton() {
  return (
    <div className={authStyles.container} data-testid="auth-loading">
      <div
        className={skeletonStyles.bone}
        style={{ width: '8rem', height: '2rem', ...skeletonAnimation }}
      />
    </div>
  );
}

// ── Issue detail skeleton ───────────────────────────────────

export function IssueDetailSkeleton() {
  return (
    <div className={detailStyles.layout} data-testid="detail-skeleton">
      <div className={detailStyles.main}>
        <div className={skeletonStyles.lineShort} style={{ width: '6rem', ...skeletonAnimation }} />
        <div
          className={skeletonStyles.bone}
          style={{ height: '2rem', width: '60%', marginBottom: '1rem', ...skeletonAnimation }}
        />
        <div className={skeletonStyles.line} style={skeletonAnimation} />
        <div className={skeletonStyles.line} style={skeletonAnimation} />
        <div className={skeletonStyles.lineShort} style={skeletonAnimation} />
      </div>
      <div className={detailStyles.sidebar}>
        <div className={skeletonStyles.card} style={{ height: '8rem', ...skeletonAnimation }} />
      </div>
    </div>
  );
}
