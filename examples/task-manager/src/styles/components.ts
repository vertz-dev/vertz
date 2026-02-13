/**
 * Shared component styles using css() and variants().
 *
 * These demonstrate the compile-time CSS API with shorthand syntax
 * and the typed variant system.
 */

import { css, variants } from '@vertz/ui';

// ── Layout styles ────────────────────────────────────────────────

export const layoutStyles = css({
  shell: ['flex', 'min-h:screen', 'bg:background'],
  sidebar: ['w:64', 'bg:surface', 'border-r:1', 'border:border', 'p:4'],
  main: ['flex-1', 'p:6'],
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
      lg: ['text:base', 'px:6', 'py:3', 'h:12'],
    },
  },
  defaultVariants: {
    intent: 'primary',
    size: 'md',
  },
});

// ── Badge variants (task priority/status) ────────────────────────

export const badge = variants({
  base: ['inline-flex', 'items:center', 'rounded:full', 'text:xs', 'font:medium', 'px:2', 'py:0.5'],
  variants: {
    color: {
      blue: ['bg:primary.100', 'text:primary.700'],
      green: ['bg:success.100', 'text:success.700'],
      yellow: ['bg:warning.100', 'text:warning.700'],
      red: ['bg:danger.100', 'text:danger.700'],
      gray: ['bg:gray.100', 'text:gray.600'],
    },
  },
  defaultVariants: {
    color: 'gray',
  },
});

// ── Card styles ──────────────────────────────────────────────────

export const cardStyles = css({
  card: [
    'bg:surface',
    'rounded:lg',
    'border:1',
    'border:border',
    'p:4',
    'hover:shadow:md',
    'transition:shadow',
  ],
  cardHeader: ['flex', 'justify:between', 'items:start', 'mb:2'],
  cardTitle: ['font:lg', 'font:semibold', 'text:foreground'],
  cardBody: ['text:sm', 'text:muted'],
  cardFooter: ['flex', 'items:center', 'gap:2', 'mt:3', 'pt:3', 'border-t:1', 'border:border'],
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
    'focus:ring:primary.500',
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
  error: ['text:xs', 'text:danger.500', 'mt:1'],
});

// ── Empty state ──────────────────────────────────────────────────

export const emptyStateStyles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:12', 'text:center'],
  icon: ['text:4xl', 'text:muted', 'mb:3'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:1'],
  description: ['text:sm', 'text:muted', 'mb:4'],
});
