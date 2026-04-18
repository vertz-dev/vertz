import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ResizablePanelBlocks = {
  root: StyleBlock;
  panel: StyleBlock;
  handle: StyleBlock;
};

const focusRing: StyleBlock = {
  '&:focus-visible': {
    outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    outlineOffset: '2px',
  },
};

/** Create resizable panel css() styles following shadcn conventions. */
export function createResizablePanelStyles(): CSSOutput<ResizablePanelBlocks> {
  const s = css({
    resizableRoot: { display: 'flex', height: '100%', width: '100%' },
    resizablePanel: { overflow: 'hidden', '&': { whiteSpace: 'nowrap' } },
    resizableHandle: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: token.color.border,
      ...focusRing,
      '&:hover': { backgroundColor: token.color['muted-foreground'] },
      '&[data-orientation="horizontal"]': { width: '1px', cursor: 'col-resize' },
      '&[data-orientation="vertical"]': { height: '1px', cursor: 'row-resize' },
      '&[data-state="dragging"]': { backgroundColor: token.color.primary },
    },
  });
  return {
    root: s.resizableRoot,
    panel: s.resizablePanel,
    handle: s.resizableHandle,
    css: s.css,
  } as CSSOutput<ResizablePanelBlocks>;
}
