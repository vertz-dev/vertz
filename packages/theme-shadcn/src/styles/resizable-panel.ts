import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';

type ResizablePanelBlocks = {
  root: StyleEntry[];
  panel: StyleEntry[];
  handle: StyleEntry[];
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

/** Create resizable panel css() styles following shadcn conventions. */
export function createResizablePanelStyles(): CSSOutput<ResizablePanelBlocks> {
  const s = css({
    resizableRoot: ['flex', 'h:full', 'w:full'],
    resizablePanel: ['overflow-hidden'],
    resizableHandle: [
      'relative',
      'flex',
      'items:center',
      'justify:center',
      'bg:border',
      focusRing,
      {
        '&:hover': ['bg:muted-foreground'],
      },
      {
        '&[data-orientation="horizontal"]': {
          width: '1px',
          cursor: 'col-resize',
        },
      },
      {
        '&[data-orientation="vertical"]': {
          height: '1px',
          cursor: 'row-resize',
        },
      },
      {
        '&[data-state="dragging"]': ['bg:primary'],
      },
    ],
  });
  return {
    root: s.resizableRoot,
    panel: s.resizablePanel,
    handle: s.resizableHandle,
    css: s.css,
  } as CSSOutput<ResizablePanelBlocks>;
}
