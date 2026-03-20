/**
 * Shared component styles for the Linear clone.
 *
 * Re-exports pre-built theme styles from @vertz/theme-shadcn for consistent
 * dialog animations, button variants, inputs, cards, and labels.
 * App-specific styles (layout, empty state, loading skeletons) are defined here.
 */

import { css, keyframes } from '@vertz/ui';
import { themeStyles } from './theme';

// ── Re-export theme styles for easy consumption ─────────────
export const cardStyles = themeStyles.card;
export const inputStyles = themeStyles.input;
export const labelStyles = themeStyles.label;
export const formGroupStyles = themeStyles.formGroup;
export const dialogStyles = themeStyles.dialog;

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  field: ['flex', 'flex-col', 'gap:1', 'mb:4'],
  select: [
    'w:full',
    'px:3',
    'py:2',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:background',
    'text:foreground',
    'text:sm',
  ],
  error: ['text:xs', 'text:destructive', 'mt:1'],
});

// ── Empty state ─────────────────────────────────────────────

export const emptyStateStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted-foreground', 'mb:4'],
});

// ── Loading skeleton ────────────────────────────────────────

const shimmer = keyframes('linear-shimmer', {
  '0%': { backgroundPosition: '-200% 0' },
  '100%': { backgroundPosition: '200% 0' },
});

export const skeletonStyles = css({
  bone: ['rounded:md', 'bg:muted'],
  card: ['rounded:md', 'bg:muted', 'h:20', 'mb:2'],
  line: ['rounded:sm', 'bg:muted', 'h:4', 'mb:2'],
  lineShort: ['rounded:sm', 'bg:muted', 'h:4', 'mb:2'],
});

export const skeletonAnimation = {
  background:
    'linear-gradient(90deg, transparent 25%, hsl(var(--muted-foreground) / 0.08) 50%, transparent 75%)',
  backgroundSize: '200% 100%',
  animation: `${shimmer} 1.5s ease-in-out infinite`,
};

// ── Error fallback ──────────────────────────────────────────

export const errorFallbackStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  title: ['font:lg', 'font:semibold', 'text:destructive', 'mb:2'],
  message: ['text:sm', 'text:muted-foreground', 'mb:4', 'max-w:md'],
  retryButton: [
    'px:4',
    'py:2',
    'rounded:md',
    'bg:primary',
    'text:primary-foreground',
    'text:sm',
    'font:medium',
    'cursor:pointer',
    'border:0',
    'transition:colors',
    'hover:bg:primary.700',
  ],
});
