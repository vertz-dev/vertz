import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ScrollAreaBlocks = {
  root: StyleBlock;
  viewport: StyleBlock;
  scrollbar: StyleBlock;
  thumb: StyleBlock;
};

/** Create scroll-area css() styles following shadcn conventions. */
export function createScrollAreaStyles(): CSSOutput<ScrollAreaBlocks> {
  const s = css({
    scrollAreaRoot: { position: 'relative', overflow: 'hidden' },
    scrollAreaViewport: { height: '100%', width: '100%', '&': { borderRadius: 'inherit' } },
    scrollAreaScrollbar: {
      display: 'flex',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&': { touchAction: 'none', userSelect: 'none', padding: '1px' },
      '&[data-orientation="vertical"]': {
        height: '100%',
        width: token.spacing['2.5'],
        borderLeftWidth: '1px',
        borderColor: 'transparent',
      },
      '&[data-orientation="horizontal"]': {
        height: token.spacing['2.5'],
        flexDirection: 'column',
        borderTopWidth: '1px',
        borderColor: 'transparent',
      },
    },
    scrollAreaThumb: {
      position: 'relative',
      flex: '1 1 0%',
      borderRadius: token.radius.full,
      '&': { backgroundColor: 'color-mix(in oklch, var(--color-foreground) 40%, transparent)' },
    },
  });
  return {
    root: s.scrollAreaRoot,
    viewport: s.scrollAreaViewport,
    scrollbar: s.scrollAreaScrollbar,
    thumb: s.scrollAreaThumb,
    css: s.css,
  } as CSSOutput<ScrollAreaBlocks>;
}
