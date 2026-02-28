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

/** Create alert-dialog css() styles. Shares visual language with Dialog. */
export function createAlertDialogStyles(): CSSOutput<AlertDialogBlocks> {
  const s = css({
    alertDialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        '&': [{ property: 'background-color', value: 'oklch(0 0 0 / 50%)' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 150ms ease-out forwards')],
      },
    ],
    alertDialogPanel: [
      'fixed',
      'z:50',
      'bg:background',
      'text:foreground',
      'rounded:lg',
      'border:1',
      'border:border',
      'shadow:lg',
      'p:6',
      'gap:4',
      {
        '&': [
          { property: 'max-width', value: '32rem' },
          { property: 'width', value: '100%' },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 200ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 200ms ease-out forwards')],
      },
    ],
    alertDialogTitle: ['text:lg', 'font:semibold'],
    alertDialogDescription: ['text:sm', 'text:muted-foreground'],
    alertDialogFooter: ['flex', 'items:center', 'justify:end', 'gap:2', 'pt:4'],
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
