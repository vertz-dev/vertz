/**
 * Shared component styles for the Entity Todo app.
 *
 * Standard UI styles (button, card, input, label, formGroup) come
 * from the @vertz/theme-shadcn theme. App-specific styles (layout, todo
 * items, empty state) are defined here using shadcn tokens.
 */

import { css, token } from '@vertz/ui';
import { themeStyles } from './theme';

// ── Re-export theme styles for easy consumption ─────────────
export const button = themeStyles.button;
export const cardStyles = themeStyles.card;
export const inputStyles = themeStyles.input;
export const labelStyles = themeStyles.label;
export const formGroupStyles = themeStyles.formGroup;

// ── Layout styles (app-specific) ────────────────────────────

export const layoutStyles = css({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: token.color.background,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingInline: token.spacing[6],
    paddingBlock: token.spacing[3],
    backgroundColor: token.color.card,
    borderBottomWidth: '1px',
    borderColor: token.color.border,
  },
  main: {
    flex: '1 1 0%',
    maxWidth: '42rem',
    marginInline: 'auto',
    width: '100%',
    padding: token.spacing[6],
  },
});

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  error: {
    fontSize: token.font.size.xs,
    color: token.color.destructive,
    marginTop: token.spacing[1],
  },
});

// ── Todo item styles ─────────────────────────────────────────

export const todoItemStyles = css({
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    padding: token.spacing[3],
    width: '100%',
    backgroundColor: token.color.card,
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
  },
  checkbox: { width: token.spacing[5], height: token.spacing[5], cursor: 'pointer' },
  label: {
    flex: '1 1 0%',
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.normal,
    color: token.color.foreground,
  },
  labelCompleted: {
    flex: '1 1 0%',
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.normal,
    color: token.color['muted-foreground'],
    textDecoration: 'line-through',
  },
  deleteBtn: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    cursor: 'pointer',
    '&:hover': { color: token.color.destructive },
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
  heading: {
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
