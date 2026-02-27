import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type CardBlocks = {
  root: string[];
  header: string[];
  title: string[];
  description: string[];
  content: string[];
  footer: string[];
};

/** Create card css() styles. */
export function createCard(): CSSOutput<CardBlocks> {
  return css({
    root: [
      'bg:card',
      'text:card-foreground',
      'rounded:lg',
      'border:1',
      'border:border',
      'shadow:sm',
    ],
    header: ['flex', 'flex-col', 'gap:1.5', 'p:6'],
    title: ['text:2xl', 'font:semibold', 'leading:none', 'tracking:tight'],
    description: ['text:sm', 'text:muted-foreground'],
    content: ['p:6', 'pt:0'],
    footer: ['flex', 'items:center', 'p:6', 'pt:0'],
  });
}
