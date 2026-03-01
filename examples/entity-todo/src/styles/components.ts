/**
 * Shared component styles for the Entity Todo app.
 *
 * Standard UI styles (button, card, input, label, formGroup) come
 * from the @vertz/theme-shadcn theme. App-specific styles (layout, todo
 * items, empty state) are defined here using shadcn tokens.
 */

import { css } from '@vertz/ui';
import { themeStyles } from './theme';

// ── Re-export theme styles for easy consumption ─────────────
export const button = themeStyles.button;
export const cardStyles = themeStyles.card;
export const inputStyles = themeStyles.input;
export const labelStyles = themeStyles.label;
export const formGroupStyles = themeStyles.formGroup;

// ── Layout styles (app-specific) ────────────────────────────

export const layoutStyles = css({
  shell: ['flex', 'flex-col', 'min-h:screen', 'bg:background'],
  header: [
    'flex',
    'justify:between',
    'items:center',
    'px:6',
    'py:3',
    'bg:card',
    'border-b:1',
    'border:border',
  ],
  main: ['flex-1', 'max-w:lg', 'mx:auto', 'w:full', 'p:6'],
});

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  error: ['text:xs', 'text:destructive', 'mt:1'],
});

// ── Todo item styles ─────────────────────────────────────────

export const todoItemStyles = css({
  item: [
    'flex',
    'items:center',
    'gap:3',
    'p:3',
    'bg:card',
    'rounded:md',
    'border:1',
    'border:border',
  ],
  checkbox: ['w:5', 'h:5', 'cursor:pointer'],
  title: ['flex-1', 'text:sm', 'text:foreground'],
  titleCompleted: ['flex-1', 'text:sm', 'text:muted-foreground'],
  deleteBtn: ['text:xs', 'text:muted-foreground', 'hover:text:destructive', 'cursor:pointer'],
});

// ── Empty state ─────────────────────────────────────────────

export const emptyStateStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted-foreground', 'mb:4'],
});
