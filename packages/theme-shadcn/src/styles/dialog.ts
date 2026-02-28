import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type DialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  header: StyleEntry[];
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

/** Create dialog css() styles matching shadcn v4 Nova theme. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        // Nova: bg-black/10 + backdrop-blur-xs (lighter overlay with blur)
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
      'gap:4',
      {
        '&': [
          { property: 'display', value: 'grid' },
          { property: 'width', value: '100%' },
          { property: 'max-width', value: 'calc(100% - 2rem)' },
          // Nova: ring-1 ring-foreground/10 instead of border
          {
            property: 'box-shadow',
            value: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
          },
          // Nova: rounded-xl p-4 text-sm
          { property: 'border-radius', value: '0.75rem' },
          { property: 'padding', value: '1rem' },
          { property: 'font-size', value: '0.875rem' },
          // Center via inset + margin:auto (avoids transform conflict with animations)
          { property: 'inset', value: '0' },
          { property: 'margin', value: 'auto' },
          { property: 'height', value: 'fit-content' },
          { property: 'outline', value: 'none' },
          { property: 'container-type', value: 'inline-size' },
        ],
        // Nova: sm:max-w-sm (24rem vs base 32rem)
        '@media (min-width: 640px)': [{ property: 'max-width', value: '24rem' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 100ms ease-out forwards')],
      },
    ],
    dialogHeader: [
      'flex',
      'flex-col',
      'gap:2',
      {
        '@media (min-width: 640px)': [{ property: 'text-align', value: 'left' }],
      },
    ],
    dialogTitle: [
      {
        // Nova: text-base font-medium (smaller/lighter than base text-lg font-semibold)
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
      'rounded:xs',
      'cursor:pointer',
      {
        '&': [
          // Nova: top-2 right-2 (closer to corner)
          { property: 'top', value: '0.5rem' },
          { property: 'right', value: '0.5rem' },
          { property: 'opacity', value: '0.7' },
          { property: 'transition', value: 'opacity 150ms' },
          { property: 'display', value: 'inline-flex' },
          { property: 'align-items', value: 'center' },
          { property: 'justify-content', value: 'center' },
          { property: 'width', value: '1rem' },
          { property: 'height', value: '1rem' },
          { property: 'background', value: 'none' },
          { property: 'border', value: 'none' },
          { property: 'color', value: 'currentColor' },
          { property: 'padding', value: '0' },
        ],
        '&:hover': [{ property: 'opacity', value: '1' }],
        '&:disabled': [{ property: 'pointer-events', value: 'none' }],
      },
      focusRing,
    ],
    dialogFooter: [
      'flex',
      'gap:2',
      {
        '&': [
          { property: 'flex-direction', value: 'column-reverse' },
          // Nova: bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4
          {
            property: 'background-color',
            value: 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
          },
          { property: 'margin', value: '0 -1rem -1rem -1rem' },
          { property: 'border-radius', value: '0 0 0.75rem 0.75rem' },
          { property: 'border-top', value: '1px solid var(--color-border)' },
          { property: 'padding', value: '1rem' },
        ],
        '@container (min-width: 20rem)': [
          { property: 'flex-direction', value: 'row' },
          { property: 'justify-content', value: 'flex-end' },
        ],
      },
    ],
  });
  return {
    overlay: s.dialogOverlay,
    panel: s.dialogPanel,
    header: s.dialogHeader,
    title: s.dialogTitle,
    description: s.dialogDescription,
    close: s.dialogClose,
    footer: s.dialogFooter,
    css: s.css,
  } as CSSOutput<DialogBlocks>;
}
