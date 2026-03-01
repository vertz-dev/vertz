import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type CardBlocks = {
  root: string[];
  header: string[];
  title: string[];
  description: string[];
  content: string[];
  footer: string[];
  action: string[];
};

/** Create card css() styles. */
export function createCard(): CSSOutput<CardBlocks> {
  const s = css({
    cardRoot: [
      'flex',
      'flex-col',
      'bg:card',
      'text:card-foreground',
      'overflow-hidden',
      'gap:4',
      'py:4',
      'text:sm',
      {
        '&': [
          { property: 'border-radius', value: '0.75rem' },
          {
            property: 'box-shadow',
            value: '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent)',
          },
        ],
      },
    ],
    cardHeader: ['flex', 'flex-col', 'gap:1', 'px:4'],
    cardTitle: [
      'font:medium',
      {
        '&': [
          { property: 'font-size', value: '1rem' },
          { property: 'line-height', value: '1.375' },
        ],
      },
    ],
    cardDescription: ['text:sm', 'text:muted-foreground'],
    cardContent: ['px:4'],
    cardFooter: [
      'flex',
      'items:center',
      'gap:2',
      'p:4',
      'border-t:1',
      'border:border',
      {
        '&': [
          {
            property: 'background-color',
            value: 'color-mix(in oklch, var(--color-muted) 50%, transparent)',
          },
          { property: 'border-radius', value: '0 0 0.75rem 0.75rem' },
          { property: 'margin-bottom', value: '-1rem' },
        ],
      },
    ],
    cardAction: ['ml:auto'],
  });
  return {
    root: s.cardRoot,
    header: s.cardHeader,
    title: s.cardTitle,
    description: s.cardDescription,
    content: s.cardContent,
    footer: s.cardFooter,
    action: s.cardAction,
    css: s.css,
  } as CSSOutput<CardBlocks>;
}
