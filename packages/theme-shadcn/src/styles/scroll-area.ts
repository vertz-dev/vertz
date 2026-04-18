import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ScrollAreaBlocks = {
  root: StyleEntry[];
  viewport: StyleEntry[];
  scrollbar: StyleEntry[];
  thumb: StyleEntry[];
};

/** Create scroll-area css() styles following shadcn conventions. */
export function createScrollAreaStyles(): CSSOutput<ScrollAreaBlocks> {
  const s = css({
    scrollAreaRoot: { position: 'relative', overflow: 'hidden' },
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
        '&[data-orientation="vertical"]': {
          height: '100%',
          width: token.spacing['2.5'],
          borderLeftWidth: '1',
          borderColor: 'transparent',
        },
      },
      {
        '&[data-orientation="horizontal"]': {
          height: token.spacing['2.5'],
          flexDirection: 'column',
          borderTopWidth: '1',
          borderColor: 'transparent',
        },
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
