import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type DialogBlocks = {
  overlay: StyleEntry[];
  panel: StyleEntry[];
  title: StyleEntry[];
  description: StyleEntry[];
  close: StyleEntry[];
  footer: StyleEntry[];
};

/** Create dialog css() styles. */
export function createDialogStyles(): CSSOutput<DialogBlocks> {
  const s = css({
    dialogOverlay: [
      'fixed',
      'inset:0',
      'z:40',
      'bg:background',
      'opacity:0.8',
      { '&[data-state="closed"]': ['hidden'] },
    ],
    dialogPanel: [
      'fixed',
      'z:50',
      'bg:card',
      'text:card-foreground',
      'rounded:lg',
      'border:1',
      'border:border',
      'shadow:lg',
      'p:6',
      { '&[data-state="closed"]': ['hidden'] },
    ],
    dialogTitle: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    dialogDescription: ['text:sm', 'text:muted-foreground'],
    dialogClose: ['absolute', 'rounded:sm', 'opacity:0.7', 'hover:opacity:1', 'cursor:pointer'],
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
