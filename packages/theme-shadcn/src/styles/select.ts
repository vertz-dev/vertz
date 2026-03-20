import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl, bgOpacity, DARK } from './_helpers';

type SelectBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
  itemIndicator: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
  scrollButton: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { 'outline-offset': '2px' },
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
        '&': {
          height: '2rem',
          'padding-top': '0.5rem',
          'padding-bottom': '0.5rem',
          'padding-right': '0.5rem',
          'padding-left': '0.625rem',
        },
      },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      { '&[data-state="open"]': ['border:ring'] },
      { [DARK]: [bgOpacity('input', 30)] },
      // Chevron icon — muted, no-shrink
      {
        '& [data-part="chevron"]': {
          opacity: '0.5',
          'flex-shrink': '0',
          display: 'flex',
          'align-items': 'center',
        },
      },
    ],
    selectContent: [
      'z:50',
      'overflow-hidden',
      'bg:popover',
      'text:popover-foreground',
      'rounded:lg',
      'p:1',
      // Nova: ring-1 ring-foreground/10 instead of border, shadow-md, min-w-36
      {
        '&': {
          'box-shadow':
            '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          'min-width': '9rem',
        },
      },
      {
        '&[data-state="open"][data-side="bottom"]': [
          animationDecl('vz-slide-in-from-top 150ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="open"][data-side="top"]': [
          animationDecl('vz-slide-in-from-bottom 150ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="open"]:not([data-side])': [
          animationDecl('vz-zoom-in 150ms ease-out forwards'),
        ],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
    selectItem: [
      'flex',
      'items:center',
      'gap:2',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'rounded:md',
      'outline-none',
      'relative',
      // Nova: pr-8 pl-2
      {
        '&': {
          'padding-right': '2rem',
          'padding-left': '0.5rem',
        },
      },
      { '&:hover:not([aria-selected="true"])': ['bg:accent', 'text:accent-foreground'] },
      { '&:focus:not([aria-selected="true"])': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    // Check indicator — absolutely positioned on the right side of the item
    selectItemIndicator: [
      'absolute',
      'flex',
      'items:center',
      'justify:center',
      {
        '&': {
          right: '0.5rem',
          width: '0.875rem',
          height: '0.875rem',
          display: 'none',
        },
      },
      {
        '[aria-selected="true"] > &': { display: 'flex' },
      },
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
        '&': {
          'margin-left': '-0.25rem',
          'margin-right': '-0.25rem',
          height: '1px',
        },
      },
    ],
    selectScrollButton: ['flex', 'items:center', 'justify:center', 'py:1', 'cursor:default'],
  });
  return {
    trigger: s.selectTrigger,
    content: s.selectContent,
    item: s.selectItem,
    itemIndicator: s.selectItemIndicator,
    group: s.selectGroup,
    label: s.selectLabel,
    separator: s.selectSeparator,
    scrollButton: s.selectScrollButton,
    css: s.css,
  } as CSSOutput<SelectBlocks>;
}
