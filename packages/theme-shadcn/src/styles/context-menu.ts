import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type ContextMenuBlocks = {
  content: StyleEntry[];
  item: StyleEntry[];
  group: StyleEntry[];
  label: StyleEntry[];
  separator: StyleEntry[];
};

/** Create context-menu css() styles. */
export function createContextMenuStyles(): CSSOutput<ContextMenuBlocks> {
  const s = css({
    cmContent: [
      'z:50',
      'overflow-hidden',
      'bg:popover',
      'text:popover-foreground',
      'rounded:lg',
      'w:fit',
      'p:1',
      {
        '&': {
          'box-shadow':
            '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          'min-width': '8rem',
        },
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
    cmItem: [
      'flex',
      'items:center',
      'gap:1.5',
      'px:1.5',
      'py:1',
      'text:sm',
      'cursor:pointer',
      'rounded:md',
      'outline-none',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    cmGroup: ['py:1'],
    cmLabel: ['px:1.5', 'py:1', 'text:xs', 'font:medium', 'text:muted-foreground'],
    cmSeparator: [
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
  });
  return {
    content: s.cmContent,
    item: s.cmItem,
    group: s.cmGroup,
    label: s.cmLabel,
    separator: s.cmSeparator,
    css: s.css,
  } as CSSOutput<ContextMenuBlocks>;
}
