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
  const s = css({
    cardRoot: [
      'bg:card',
      'text:card-foreground',
      'rounded:xl',
      'border:1',
      'border:border',
      'shadow:sm',
    ],
    cardHeader: ['flex', 'flex-col', 'gap:1.5', 'p:6'],
    cardTitle: ['text:2xl', 'font:semibold', 'leading:none', 'tracking:tight'],
    cardDescription: ['text:sm', 'text:muted-foreground'],
    cardContent: ['p:6', 'pt:0'],
    cardFooter: ['flex', 'items:center', 'p:6', 'pt:0'],
  });
  return {
    root: s.cardRoot,
    header: s.cardHeader,
    title: s.cardTitle,
    description: s.cardDescription,
    content: s.cardContent,
    footer: s.cardFooter,
    css: s.css,
  } as CSSOutput<CardBlocks>;
}
