import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  close: StyleEntry[];
  footer: StyleEntry[];
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

/** Create dialog css() styles matching shadcn v4 nova. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: [
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
    dialogPanel: [
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
    dialogTitle: [
      {
        '&': [
          { property: 'font-size', value: '1rem' },
          { property: 'line-height', value: '1' },
          { property: 'font-weight', value: '500' },
        ],
      },
    ],
    dialogDescription: ['text:sm', 'text:muted-foreground'],
    dialogClose: [
      'absolute',
      'rounded:sm',
      'cursor:pointer',
      'transition:colors',
      {
        '&': [
          { property: 'top', value: '0.5rem' },
          { property: 'right', value: '0.5rem' },
        ],
      },
      focusRing,
    ],
    dialogFooter: [
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
  });
  return {
    overlay: s.dialogOverlay,
    panel: s.dialogPanel,
    title: s.dialogTitle,
    description: s.dialogDescription,
    close: s.dialogClose,
    footer: s.dialogFooter,
    css: s.css,
  } as CSSOutput<DialogBlocks>;
}
