import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ResizablePanelBlocks = {
  root: StyleEntry[];
  panel: StyleEntry[];
  handle: StyleEntry[];
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
        '&[data-orientation="horizontal"]': [
          { property: 'width', value: '1px' },
          {
            property: 'cursor',
            value: 'col-resize',
          },
        ],
      },
      {
        '&[data-orientation="vertical"]': [
          { property: 'height', value: '1px' },
          {
            property: 'cursor',
            value: 'row-resize',
          },
        ],
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
