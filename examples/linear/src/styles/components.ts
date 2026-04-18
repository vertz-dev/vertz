/**
 * Shared component styles for the Linear clone.
 *
 * Re-exports pre-built theme styles from @vertz/theme-shadcn for consistent
 * dialog animations, button variants, inputs, cards, and labels.
 * App-specific styles (layout, empty state, loading skeletons) are defined here.
 */

import { css, keyframes, token } from '@vertz/ui';
import { themeStyles } from './theme';

// ── Re-export theme styles for easy consumption ─────────────
export const cardStyles = themeStyles.card;
export const inputStyles = themeStyles.input;
export const labelStyles = themeStyles.label;
export const formGroupStyles = themeStyles.formGroup;
export const dialogStyles = themeStyles.dialog;

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[1],
    marginBottom: token.spacing[4],
  },
  select: {
    width: '100%',
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    fontSize: token.font.size.sm,
  },
  error: {
    fontSize: token.font.size.xs,
    color: token.color.destructive,
    marginTop: token.spacing[1],
  },
});

// ── Empty state ─────────────────────────────────────────────

export const emptyStateStyles = css({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: token.spacing[12],
    textAlign: 'center',
  },
  title: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.semibold,
    color: token.color.foreground,
    marginBottom: token.spacing[1],
  },
  description: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[4],
  },
});

// ── Loading skeleton ────────────────────────────────────────

const shimmer = keyframes('linear-shimmer', {
  '0%': { 'background-position': '-200% 0' },
  '100%': { 'background-position': '200% 0' },
});

export const skeletonStyles = css({
  bone: { borderRadius: token.radius.md, backgroundColor: token.color.muted },
  card: {
    borderRadius: token.radius.md,
    backgroundColor: token.color.muted,
    height: token.spacing[20],
    marginBottom: token.spacing[2],
  },
  line: {
    borderRadius: token.radius.sm,
    backgroundColor: token.color.muted,
    height: token.spacing[4],
    marginBottom: token.spacing[2],
  },
  lineShort: {
    borderRadius: token.radius.sm,
    backgroundColor: token.color.muted,
    height: token.spacing[4],
    width: '66.666667%',
    marginBottom: token.spacing[2],
  },
});

export const skeletonAnimation = {
  background:
    'linear-gradient(90deg, transparent 25%, hsl(var(--muted-foreground) / 0.08) 50%, transparent 75%)',
  backgroundSize: '200% 100%',
  animation: `${shimmer} 1.5s ease-in-out infinite`,
};

// ── Error fallback ──────────────────────────────────────────

export const errorFallbackStyles = css({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBlock: token.spacing[12],
    textAlign: 'center',
  },
  title: {
    fontSize: token.font.size.lg,
    fontWeight: token.font.weight.semibold,
    color: token.color.destructive,
    marginBottom: token.spacing[2],
  },
  message: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[4],
    maxWidth: '28rem',
  },
  retryButton: {
    paddingInline: token.spacing[4],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    backgroundColor: token.color.primary,
    color: token.color['primary-foreground'],
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    cursor: 'pointer',
    borderWidth: '0px',
    transition: 'colors',
    '&:hover': { backgroundColor: 'color-mix(in oklch, var(--color-primary) 90%, transparent)' },
  },
});
