import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl, bgOpacity, DARK } from './_helpers';

type SelectBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
  scrollButton: StyleEntry[];
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
      'w:full',
      'items:center',
      'justify:between',
      'whitespace-nowrap',
      'gap:1.5',
      'rounded:lg',
      'border:1',
      'border:input',
      'bg:transparent',
      'text:sm',
      'cursor:pointer',
      // Nova: h-8, py-2 pr-2 pl-2.5
      {
        '&': [
          { property: 'height', value: '2rem' },
          { property: 'padding-top', value: '0.5rem' },
          { property: 'padding-bottom', value: '0.5rem' },
          { property: 'padding-right', value: '0.5rem' },
          { property: 'padding-left', value: '0.625rem' },
        ],
      },
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
      'rounded:lg',
      // Nova: ring-1 ring-foreground/10 instead of border, shadow-md, min-w-36
      {
        '&': [
          {
            property: 'box-shadow',
            value:
              '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          },
          { property: 'min-width', value: '9rem' },
        ],
      },
      {
        '&[data-state="open"][data-side="bottom"]': [
          animationDecl('vz-slide-down-in 100ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="open"][data-side="top"]': [
          animationDecl('vz-slide-up-in 100ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="open"]:not([data-side])': [
          animationDecl('vz-zoom-in 100ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 100ms ease-out forwards')],
      },
    ],
    selectItem: [
      'flex',
      'items:center',
      'gap:1.5',
      'py:1',
      'text:sm',
      'cursor:pointer',
      'rounded:md',
      'outline-none',
      // Nova: pr-8 pl-1.5
      {
        '&': [
          { property: 'padding-right', value: '2rem' },
          { property: 'padding-left', value: '0.375rem' },
        ],
      },
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    // Nova: scroll-my-1 p-1
    selectGroup: ['p:1'],
    // Nova: px-1.5 py-1 text-xs
    selectLabel: ['px:1.5', 'py:1', 'text:xs', 'font:semibold', 'text:muted-foreground'],
    // Nova: bg-border -mx-1 my-1 h-px
    selectSeparator: [
      'my:1',
      'bg:border',
      {
        '&': [
          { property: 'margin-left', value: '-0.25rem' },
          { property: 'margin-right', value: '-0.25rem' },
          { property: 'height', value: '1px' },
        ],
      },
    ],
    selectScrollButton: ['flex', 'items:center', 'justify:center', 'py:1', 'cursor:default'],
  });
  return {
    trigger: s.selectTrigger,
    content: s.selectContent,
    item: s.selectItem,
    group: s.selectGroup,
    label: s.selectLabel,
    separator: s.selectSeparator,
    scrollButton: s.selectScrollButton,
    css: s.css,
  } as CSSOutput<SelectBlocks>;
}
