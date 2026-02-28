import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type CarouselBlocks = {
  root: StyleEntry[];
  viewport: StyleEntry[];
  slide: StyleEntry[];
  prevButton: StyleEntry[];
  nextButton: StyleEntry[];
};

/** Create carousel css() styles following shadcn conventions. */
export function createCarouselStyles(): CSSOutput<CarouselBlocks> {
  const s = css({
    carouselRoot: ['relative', 'overflow-hidden'],
    carouselViewport: ['overflow-hidden'],
    carouselSlide: [
      'shrink-0',
      {
        '&': [
          { property: 'min-width', value: '0' },
          { property: 'flex-grow', value: '0' },
          { property: 'flex-basis', value: '100%' },
        ],
      },
      { '&[data-state="inactive"]': ['opacity:0'] },
      { '&[data-state="active"]': ['opacity:1'] },
    ],
    carouselPrevButton: [
      'absolute',
      'h:8',
      'w:8',
      'rounded:full',
      'border:1',
      'border:border',
      'bg:background',
      'inline-flex',
      'items:center',
      'justify:center',
      'cursor:pointer',
      {
        '&': [
          { property: 'left', value: '0.5rem' },
          { property: 'top', value: '50%' },
          { property: 'transform', value: 'translateY(-50%)' },
        ],
      },
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
    carouselNextButton: [
      'absolute',
      'h:8',
      'w:8',
      'rounded:full',
      'border:1',
      'border:border',
      'bg:background',
      'inline-flex',
      'items:center',
      'justify:center',
      'cursor:pointer',
      {
        '&': [
          { property: 'right', value: '0.5rem' },
          { property: 'top', value: '50%' },
          { property: 'transform', value: 'translateY(-50%)' },
        ],
      },
      { '&:hover': ['bg:accent', 'text:accent-foreground'] },
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
    ],
  });
  return {
    root: s.carouselRoot,
    viewport: s.carouselViewport,
    slide: s.carouselSlide,
    prevButton: s.carouselPrevButton,
    nextButton: s.carouselNextButton,
    css: s.css,
  } as CSSOutput<CarouselBlocks>;
}
