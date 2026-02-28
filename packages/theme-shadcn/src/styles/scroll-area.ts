import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ScrollAreaBlocks = {
  root: StyleEntry[];
  viewport: StyleEntry[];
  scrollbar: StyleEntry[];
  thumb: StyleEntry[];
};

/** Create scroll-area css() styles following shadcn conventions. */
export function createScrollAreaStyles(): CSSOutput<ScrollAreaBlocks> {
  const s = css({
    scrollAreaRoot: ['relative', 'overflow-hidden'],
    scrollAreaViewport: [
      'h:full',
      'w:full',
      { '&': [{ property: 'border-radius', value: 'inherit' }] },
    ],
    scrollAreaScrollbar: [
      'flex',
      {
        '&': [
          { property: 'touch-action', value: 'none' },
          { property: 'user-select', value: 'none' },
        ],
      },
      'transition:colors',
      { '&': [{ property: 'padding', value: '1px' }] },
      {
        '&[data-orientation="vertical"]': ['h:full', 'w:2.5', 'border-l:1', 'border:transparent'],
      },
      {
        '&[data-orientation="horizontal"]': [
          'h:2.5',
          'flex-col',
          'border-t:1',
          'border:transparent',
        ],
      },
    ],
    scrollAreaThumb: ['relative', 'flex-1', 'rounded:full', 'bg:border'],
  });
  return {
    root: s.scrollAreaRoot,
    viewport: s.scrollAreaViewport,
    scrollbar: s.scrollAreaScrollbar,
    thumb: s.scrollAreaThumb,
    css: s.css,
  } as CSSOutput<ScrollAreaBlocks>;
}
