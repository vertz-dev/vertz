import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type AlertDialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  footer: StyleEntry[];
  cancel: StyleEntry[];
  action: StyleEntry[];
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

/** Create alert-dialog css() styles matching shadcn v4 nova. */
export function createAlertDialogStyles(): CSSOutput<AlertDialogBlocks> {
  const s = css({
    alertDialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        '&': [
          { property: 'background-color', value: 'oklch(0 0 0 / 10%)' },
          { property: 'backdrop-filter', value: 'blur(4px)' },
          { property: '-webkit-backdrop-filter', value: 'blur(4px)' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 100ms ease-out forwards')],
      },
    ],
    alertDialogPanel: [
      'fixed',
      'z:50',
      'bg:background',
      'text:foreground',
      'rounded:xl',
      'shadow:lg',
      'p:4',
      'gap:4',
      'text:sm',
      {
        '&': [
          { property: 'display', value: 'grid' },
          { property: 'width', value: '100%' },
          { property: 'max-width', value: 'calc(100% - 2rem)' },
          { property: 'box-shadow', value: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)' },
          // Center via inset + margin:auto (avoids transform conflict with animations)
          { property: 'inset', value: '0' },
          { property: 'margin', value: 'auto' },
          { property: 'height', value: 'fit-content' },
        ],
        '@media (min-width: 640px)': [{ property: 'max-width', value: '24rem' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 100ms ease-out forwards')],
      },
    ],
    alertDialogTitle: [
      {
        '&': [
          { property: 'font-size', value: '1rem' },
          { property: 'font-weight', value: '500' },
        ],
      },
    ],
    alertDialogDescription: ['text:sm', 'text:muted-foreground'],
    alertDialogFooter: [
      'flex',
      'gap:2',
      {
        '&': [
          { property: 'background-color', value: 'color-mix(in oklch, var(--color-muted) 50%, transparent)' },
          { property: 'margin', value: '0 -1rem -1rem' },
          { property: 'padding', value: '1rem' },
          { property: 'border-top', value: '1px solid var(--color-border)' },
          { property: 'border-radius', value: '0 0 var(--radius-xl) var(--radius-xl)' },
          { property: 'flex-direction', value: 'row' },
          { property: 'justify-content', value: 'flex-end' },
        ],
      },
    ],
    alertDialogCancel: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:background',
      'px:4',
      'py:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      focusRing,
    ],
    alertDialogAction: [
      'inline-flex',
      'items:center',
      'justify:center',
      'rounded:md',
      'bg:primary',
      'text:primary-foreground',
      'px:4',
      'py:2',
      'text:sm',
      'font:medium',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': [{ property: 'opacity', value: '0.9' }] },
      focusRing,
    ],
  });
  return {
    overlay: s.alertDialogOverlay,
    panel: s.alertDialogPanel,
    title: s.alertDialogTitle,
    description: s.alertDialogDescription,
    footer: s.alertDialogFooter,
    cancel: s.alertDialogCancel,
    action: s.alertDialogAction,
    css: s.css,
  } as CSSOutput<AlertDialogBlocks>;
}
