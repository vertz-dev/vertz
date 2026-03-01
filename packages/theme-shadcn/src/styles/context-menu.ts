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
    cmItem: [
      'flex',
      'items:center',
      'px:2',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'rounded:sm',
      'outline-none',
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&:focus': ['bg:accent', 'text:accent-foreground'] },
      { '&[data-disabled]': ['pointer-events-none', 'opacity:0.5'] },
    ],
    cmGroup: ['py:1'],
    cmLabel: ['px:2', 'py:1.5', 'text:xs', 'font:semibold', 'text:muted-foreground'],
    cmSeparator: [
      'mx:1',
      'my:1',
      'border-t:1',
      'border:muted',
      { '&': [{ property: 'height', value: '1px' }] },
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
