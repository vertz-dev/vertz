import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

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

/** Create dialog css() styles. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: [
      'fixed',
      'inset:0',
      'z:50',
      {
        '&': [{ property: 'background-color', value: 'oklch(0 0 0 / 50%)' }],
      },
      { '&[data-state="closed"]': ['hidden'] },
    ],
    dialogPanel: [
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
      { '&[data-state="closed"]': ['hidden'] },
    ],
    dialogTitle: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    dialogDescription: ['text:sm', 'text:muted-foreground'],
    dialogClose: [
      'absolute',
      'rounded:sm',
      'opacity:0.7',
      'cursor:pointer',
      'transition:colors',
      { '&:hover': ['opacity:1'] },
      focusRing,
    ],
    dialogFooter: ['flex', 'items:center', 'justify:end', 'gap:2', 'pt:4'],
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
