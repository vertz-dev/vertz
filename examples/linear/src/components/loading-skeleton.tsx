import { css } from '@vertz/ui';
import { skeletonAnimation, skeletonStyles } from '../styles/components';

// ── Board skeleton ──────────────────────────────────────────

const boardStyles = css({
  container: ['flex', 'gap:4'],
  column: ['flex', 'flex-col', 'min-w:64', 'w:64', 'shrink-0'],
  header: ['flex', 'items:center', 'gap:2', 'px:2', 'py:2', 'mb:2'],
});

export function BoardSkeleton() {
  return (
    <div className={boardStyles.container} data-testid="board-skeleton">
      {[0, 1, 2, 3].map((col) => (
        <div className={boardStyles.column} key={col}>
          <div className={boardStyles.header}>
            <div
              className={skeletonStyles.bone}
              style={`width: 5rem; height: 1rem; ${skeletonAnimation}`}
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
  container: ['border:1', 'border:border', 'rounded:lg', 'overflow-hidden'],
  row: ['p:3', 'border-b:1', 'border:border'],
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
  container: ['grid', 'grid-cols:1', 'gap:3'],
});

export function ProjectGridSkeleton() {
  return (
    <div className={gridStyles.container} data-testid="projects-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className={skeletonStyles.card} style={`height: 5rem; ${skeletonAnimation}`} />
      ))}
    </div>
  );
}

// ── Issue detail skeleton ───────────────────────────────────

const detailStyles = css({
  layout: ['flex', 'gap:8'],
  main: ['flex-1'],
  sidebar: ['w:56', 'shrink-0'],
});

// ── Auth loading skeleton (ProtectedRoute fallback) ─────

const authStyles = css({
  container: ['flex', 'items:center', 'justify:center', 'h:screen'],
});

export function AuthLoadingSkeleton() {
  return (
    <div className={authStyles.container} data-testid="auth-loading">
      <div
        className={skeletonStyles.bone}
        style={`width: 8rem; height: 2rem; ${skeletonAnimation}`}
      />
    </div>
  );
}

// ── Issue detail skeleton ───────────────────────────────────

export function IssueDetailSkeleton() {
  return (
    <div className={detailStyles.layout} data-testid="detail-skeleton">
      <div className={detailStyles.main}>
        <div className={skeletonStyles.lineShort} style={`width: 6rem; ${skeletonAnimation}`} />
        <div
          className={skeletonStyles.bone}
          style={`height: 2rem; width: 60%; margin-bottom: 1rem; ${skeletonAnimation}`}
        />
        <div className={skeletonStyles.line} style={skeletonAnimation} />
        <div className={skeletonStyles.line} style={skeletonAnimation} />
        <div className={skeletonStyles.lineShort} style={skeletonAnimation} />
      </div>
      <div className={detailStyles.sidebar}>
        <div className={skeletonStyles.card} style={`height: 8rem; ${skeletonAnimation}`} />
      </div>
    </div>
  );
}
