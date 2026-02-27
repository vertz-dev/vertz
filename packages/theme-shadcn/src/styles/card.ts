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
      'gap:6',
      'py:6',
    ],
    cardHeader: ['flex', 'flex-col', 'gap:1.5', 'px:6'],
    cardTitle: ['font:semibold', 'leading:none', 'tracking:tight'],
    cardDescription: ['text:sm', 'text:muted-foreground'],
    cardContent: ['px:6'],
    cardFooter: ['flex', 'items:center', 'px:6'],
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
