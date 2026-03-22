import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes } from '@vertz/ui';
import { animationDecl } from './_helpers';

type ListBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
  dragHandle: StyleEntry[];
};

const listEnter = keyframes('vz-list-enter', {
  from: { opacity: '0', transform: 'translateY(-0.5rem)' },
  to: { opacity: '1', transform: 'translateY(0)' },
});

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
          position: 'relative',
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
      {
        '&[data-dragging]': {
          position: 'relative',
          'z-index': '50',
          'box-shadow': '0 4px 12px rgba(0,0,0,0.15)',
          'background-color': 'var(--color-background)',
          opacity: '1',
        },
      },
      { '&[data-presence="enter"]': [animationDecl(`${listEnter} 200ms ease-out`)] },
      {
        '&[data-presence="exit"]': [{ overflow: 'hidden', 'pointer-events': 'none' }],
      },
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
