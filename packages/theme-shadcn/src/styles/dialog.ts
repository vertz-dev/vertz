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
  return css({
    overlay: [
      'fixed',
      'inset:0',
      'z:40',
      'bg:background',
      'opacity:0.8',
      { '&[data-state="closed"]': ['hidden'] },
    ],
    panel: [
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
    title: ['text:lg', 'font:semibold', 'leading:none', 'tracking:tight'],
    description: ['text:sm', 'text:muted-foreground'],
    close: ['absolute', 'rounded:sm', 'opacity:0.7', 'hover:opacity:1', 'cursor:pointer'],
    footer: ['flex', 'items:center', 'justify:end', 'gap:2', 'pt:4'],
  });
}
