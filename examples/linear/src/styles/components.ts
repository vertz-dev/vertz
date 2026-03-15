/**
 * Shared component styles for the Linear clone.
 *
 * Re-exports pre-built theme styles from @vertz/theme-shadcn for consistent
 * dialog animations, button variants, inputs, cards, and labels.
 * App-specific styles (layout, empty state) are defined here.
 */

import { css } from '@vertz/ui';
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
