/**
 * Shared component styles for the Task Manager app.
 *
 * Standard UI styles (button, badge, card, input, label, formGroup) come
 * from the @vertz/theme-shadcn theme. App-specific styles (layout, empty
 * state, textarea, select) are defined here.
 */

import { css } from '@vertz/ui';
import { themeStyles } from './theme';

// ── Re-export theme styles for easy consumption ─────────────
export const button = themeStyles.button;
export const badge = themeStyles.badge;
export const cardStyles = themeStyles.card;
export const inputStyles = themeStyles.input;
export const labelStyles = themeStyles.label;
export const formGroupStyles = themeStyles.formGroup;
export const dialogStyles = themeStyles.dialog;

// ── Layout styles (app-specific) ────────────────────────────

export const layoutStyles = css({
  shell: ['flex', 'min-h:screen', 'bg:background'],
  sidebar: ['w:64', 'bg:card', 'border-r:1', 'border:border', 'p:4'],
  main: ['flex-1', 'p:6'],
  header: ['flex', 'justify:between', 'items:center', 'mb:4'],
});

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  formGroup: ['flex', 'flex-col', 'gap:1', 'mb:4'],
  label: ['text:sm', 'font:medium', 'text:foreground'],
  input: [
    'w:full',
    'px:3',
    'py:2',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:background',
    'text:foreground',
    'text:sm',
    'focus:outline-none',
    'focus:ring:2',
    'focus-visible:ring:ring',
    'focus-visible:border:primary',
  ],
  textarea: [
    'w:full',
    'px:3',
    'py:2',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:background',
    'text:foreground',
    'text:sm',
    'min-h:24',
    'resize:vertical',
    'focus:outline-none',
    'focus:ring:2',
    'focus-visible:ring:ring',
  ],
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
  icon: ['text:4xl', 'text:muted-foreground', 'mb:3'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted-foreground', 'mb:4'],
});
