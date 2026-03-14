import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
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
    toastViewport: [
      'fixed',
      'z:50',
      'flex',
      'flex-col',
      'gap:2',
      'p:4',
      {
        '&': {
          bottom: '0',
          right: '0',
          'max-height': '100vh',
          width: '420px',
          'max-width': '100vw',
          'pointer-events': 'none',
        },
      },
    ],
    toastRoot: [
      'flex',
      'items:center',
      'gap:4',
      'w:full',
      'rounded:2xl',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'p:4',
      'shadow:lg',
      {
        '&': { 'pointer-events': 'auto' },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-slide-in-from-bottom 200ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 150ms ease-out forwards')],
      },
    ],
    toastTitle: ['text:sm', 'font:semibold'],
    toastDescription: ['text:sm', 'text:muted-foreground'],
    toastAction: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'border:1',
      'border:border',
      'px:3',
      'text:sm',
      'font:medium',
      'transition:colors',
      'shrink-0',
      { '&': { height: '2rem' } },
      { '&:hover': ['bg:secondary'] },
      focusRing,
    ],
    toastClose: [
      'absolute',
      'rounded:sm',
      'opacity:0.7',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['opacity:1'] },
      focusRing,
    ],
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
