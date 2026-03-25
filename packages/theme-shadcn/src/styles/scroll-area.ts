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
    scrollAreaViewport: ['h:full', 'w:full', { '&': { 'border-radius': 'inherit' } }],
    scrollAreaScrollbar: [
      'flex',
      {
        '&': {
          'touch-action': 'none',
          'user-select': 'none',
          padding: '1px',
        },
      },
      'transition:colors',
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
    scrollAreaThumb: [
      'relative',
      'flex-1',
      'rounded:full',
      {
        '&': {
          'background-color': 'color-mix(in oklch, var(--color-foreground) 40%, transparent)',
        },
      },
    ],
  });
  return {
    root: s.scrollAreaRoot,
    viewport: s.scrollAreaViewport,
    scrollbar: s.scrollAreaScrollbar,
    thumb: s.scrollAreaThumb,
    css: s.css,
  } as CSSOutput<ScrollAreaBlocks>;
}
