import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type ToastBlocks = {
  viewport: StyleEntry[];
  root: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  action: StyleEntry[];
  close: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
  ],
};

/** Create toast css() styles. */
export function createToastStyles(): CSSOutput<ToastBlocks> {
  const s = css({
    toastViewport: {
      position: 'fixed',
      zIndex: '50',
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing[2],
      padding: token.spacing[4],
      '&': {
        bottom: '0',
        right: '0',
        maxHeight: '100vh',
        width: '420px',
        maxWidth: '100vw',
        pointerEvents: 'none',
      },
    },
    toastRoot: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[4],
      width: '100%',
      borderRadius: token.radius['2xl'],
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      padding: token.spacing[4],
      boxShadow: token.shadow.lg,
      '&': { pointerEvents: 'auto' },
      '&[data-state="open"]': animationDecl('vz-slide-in-from-bottom 200ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-fade-out 150ms ease-out forwards'),
    },
    toastTitle: { fontSize: token.font.size.sm, fontWeight: token.font.weight.semibold },
    toastDescription: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
    toastAction: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: token.radius.md,
      borderWidth: '1px',
      borderColor: token.color.border,
      paddingInline: token.spacing[3],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      flexShrink: '0',
      '&': { height: '2rem' },
      '&:hover': { backgroundColor: token.color.secondary },
      ...focusRing,
    },
    toastClose: {
      position: 'absolute',
      borderRadius: token.radius.sm,
      opacity: '0.7',
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&:hover': { opacity: '1' },
      ...focusRing,
    },
  });
  return {
    viewport: s.toastViewport,
    root: s.toastRoot,
    title: s.toastTitle,
    description: s.toastDescription,
    action: s.toastAction,
    close: s.toastClose,
    css: s.css,
  } as CSSOutput<ToastBlocks>;
}
