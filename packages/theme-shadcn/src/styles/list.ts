import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, keyframes, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type ListBlocks = {
  root: StyleBlock;
  item: StyleBlock;
  dragHandle: StyleBlock;
};

const listEnter = keyframes('vz-list-enter', {
  from: { opacity: '0', transform: 'translateY(-0.5rem)' },
  to: { opacity: '1', transform: 'translateY(0)' },
});

/** Create list css() styles. */
export function createListStyles(): CSSOutput<ListBlocks> {
  const s = css({
    listRoot: {
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing[0],
      '&': { listStyle: 'none', margin: '0', padding: '0', position: 'relative' },
    },
    listItem: {
      '&[data-dragging]': {
        position: 'relative',
        zIndex: '50',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        backgroundColor: 'var(--color-background)',
        opacity: '1',
      },
      '&[data-presence="enter"]': animationDecl(`${listEnter} 200ms ease-out`),
      '&[data-presence="exit"]': { overflow: 'hidden', pointerEvents: 'none' },
    },
    listDragHandle: {
      display: 'flex',
      alignItems: 'center',
      color: token.color['muted-foreground'],
      '&': { cursor: 'grab', touchAction: 'none', userSelect: 'none' },
      '&:active': { cursor: 'grabbing' },
    },
  });
  return {
    root: s.listRoot,
    item: s.listItem,
    dragHandle: s.listDragHandle,
    css: s.css,
  } as CSSOutput<ListBlocks>;
}
