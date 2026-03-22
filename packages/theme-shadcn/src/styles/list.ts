import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ListBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
  dragHandle: StyleEntry[];
};

/** Create list css() styles. */
export function createListStyles(): CSSOutput<ListBlocks> {
  const s = css({
    listRoot: [
      'flex',
      'flex-col',
      'gap:0',
      {
        '&': {
          'list-style': 'none',
          margin: '0',
          padding: '0',
        },
      },
    ],
    listItem: [
      'flex',
      'items:center',
      'gap:2',
      'px:3',
      'py:2',
      'border-b:1',
      'border:border',
      'text:sm',
      'text:foreground',
      { '&:last-child': { 'border-bottom': '0' } },
      { '&[data-dragging]': ['bg:muted', { opacity: '0.5' }] },
      { '&[data-presence="enter"]': [{ animation: 'fadeIn 200ms ease-out' }] },
      { '&[data-presence="exit"]': [{ animation: 'fadeOut 200ms ease-out' }] },
    ],
    listDragHandle: [
      'flex',
      'items:center',
      'text:muted-foreground',
      {
        '&': {
          cursor: 'grab',
          'touch-action': 'none',
          'user-select': 'none',
        },
        '&:active': { cursor: 'grabbing' },
      },
    ],
  });
  return {
    root: s.listRoot,
    item: s.listItem,
    dragHandle: s.listDragHandle,
    css: s.css,
  } as CSSOutput<ListBlocks>;
}
