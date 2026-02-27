import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl, bgOpacity, DARK } from './_helpers';

type SelectBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
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

/** Create select css() styles. */
export function createSelectStyles(): CSSOutput<SelectBlocks> {
  const s = css({
    selectTrigger: [
      'flex',
      'h:9',
      'w:full',
      'items:center',
      'justify:between',
      'whitespace-nowrap',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:transparent',
      'px:3',
      'py:2',
      'text:sm',
      'shadow:xs',
      'cursor:pointer',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      { '&[data-state="open"]': ['border:ring'] },
      { [DARK]: [bgOpacity('input', 30)] },
    ],
    selectContent: [
      'z:50',
      'overflow-hidden',
      'bg:popover',
      'text:popover-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'py:1',
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
    selectItem: [
      'flex',
      'items:center',
      'px:2',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'rounded:sm',
      'outline-none',
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
  });
  return {
    trigger: s.selectTrigger,
    content: s.selectContent,
    item: s.selectItem,
    css: s.css,
  } as CSSOutput<SelectBlocks>;
}
