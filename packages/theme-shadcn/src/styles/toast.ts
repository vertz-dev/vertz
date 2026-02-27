import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
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

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
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
        '&': [
          { property: 'bottom', value: '0' },
          { property: 'right', value: '0' },
          { property: 'max-height', value: '100vh' },
          { property: 'width', value: '420px' },
          { property: 'max-width', value: '100vw' },
          { property: 'pointer-events', value: 'none' },
        ],
      },
    ],
    toastRoot: [
      'flex',
      'items:center',
      'gap:4',
      'w:full',
      'rounded:lg',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'p:4',
      'shadow:lg',
      {
        '&': [{ property: 'pointer-events', value: 'auto' }],
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
      { '&': [{ property: 'height', value: '2rem' }] },
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
