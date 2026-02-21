/**
 * Shared component styles using css() and variants().
 */

import { css, variants } from '@vertz/ui';

// ── Layout styles ────────────────────────────────────────────────

export const layoutStyles = css({
  container: ['max-w:lg', 'mx:auto', 'p:6'],
  header: ['flex', 'justify:between', 'items:center', 'mb:6'],
});

// ── Button variants ──────────────────────────────────────────────

export const button = variants({
  base: [
    'inline-flex',
    'items:center',
    'justify:center',
    'rounded:md',
    'font:medium',
    'transition:colors',
    'cursor:pointer',
    'focus:outline-none',
    'focus:ring:2',
    'focus:ring:primary.500',
  ],
  variants: {
    intent: {
      primary: ['bg:primary.600', 'text:white', 'hover:bg:primary.700'],
      secondary: [
        'bg:surface',
        'text:foreground',
        'border:1',
        'border:border',
        'hover:bg:gray.100',
      ],
      danger: ['bg:danger.500', 'text:white', 'hover:bg:danger.700'],
      ghost: ['text:muted', 'hover:text:foreground', 'hover:bg:surface'],
    },
    size: {
      sm: ['text:xs', 'px:3', 'py:1', 'h:8'],
      md: ['text:sm', 'px:4', 'py:2', 'h:10'],
    },
  },
  defaultVariants: {
    intent: 'primary',
    size: 'md',
  },
});

// ── Form styles ──────────────────────────────────────────────────

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
    'focus:ring:primary.500',
    'focus:border:primary.500',
  ],
  error: ['text:xs', 'text:danger.500', 'mt:1'],
});

// ── Todo item styles ─────────────────────────────────────────────

export const todoItemStyles = css({
  item: [
    'flex',
    'items:center',
    'gap:3',
    'p:3',
    'bg:surface',
    'rounded:md',
    'border:1',
    'border:border',
  ],
  checkbox: ['w:5', 'h:5', 'cursor:pointer'],
  title: ['flex-1', 'text:sm', 'text:foreground'],
  titleCompleted: ['flex-1', 'text:sm', 'text:muted'],
  deleteBtn: ['text:xs', 'text:muted', 'hover:text:danger.500', 'cursor:pointer'],
});

// ── Empty state ──────────────────────────────────────────────────

export const emptyStateStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted', 'mb:4'],
});
