/**
 * Shared component styles for the Task Manager app.
 *
 * Standard UI styles (button, badge, card, input, label, formGroup) come
 * from the @vertz/theme-shadcn theme. App-specific styles (layout, empty
 * state, textarea, select) are defined here.
 */

import { css, token } from '@vertz/ui';
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
  shell: { display: 'flex', minHeight: '100vh', backgroundColor: token.color.background },
  sidebar: {
    width: token.spacing[64],
    backgroundColor: token.color.card,
    borderRightWidth: '1px',
    borderColor: token.color.border,
    padding: token.spacing[4],
  },
  main: { flex: '1 1 0%', padding: token.spacing[6] },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: token.spacing[4],
  },
});

// ── Form styles (app-specific extensions) ───────────────────

export const formStyles = css({
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[1],
    marginBottom: token.spacing[4],
  },
  label: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
  },
  input: {
    width: '100%',
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    fontSize: token.font.size.sm,
    '&:focus': { outline: '2px solid var(--color-ring)' },
    '&:focus-visible': { outlineColor: token.color.ring, borderColor: token.color.primary },
  },
  textarea: {
    width: '100%',
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    borderWidth: '1px',
    borderColor: token.color.border,
    backgroundColor: token.color.background,
    color: token.color.foreground,
    fontSize: token.font.size.sm,
    minHeight: token.spacing[24],
    resize: 'vertical',
    '&:focus': { outline: '2px solid var(--color-ring)' },
    '&:focus-visible': { outlineColor: token.color.ring },
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
  icon: {
    fontSize: token.font.size['4xl'],
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[3],
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
