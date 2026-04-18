import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

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
    carouselRoot: { position: 'relative' },
    carouselViewport: { overflow: 'hidden' },
    carouselSlide: [{ '&[data-state="inactive"]': [{ display: 'none' }] }],
    carouselPrevButton: [
      'absolute',
      'h:8',
      'w:8',
      'rounded:full',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'inline-flex',
      'items:center',
      'justify:center',
      'cursor:pointer',
      {
        '&': {
          left: '0.5rem',
          top: '50%',
          transform: 'translateY(-50%)',
        },
      },
      {
        '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
    ],
    carouselNextButton: [
      'absolute',
      'h:8',
      'w:8',
      'rounded:full',
      'border:1',
      'border:border',
      'bg:background',
      'text:foreground',
      'inline-flex',
      'items:center',
      'justify:center',
      'cursor:pointer',
      {
        '&': {
          right: '0.5rem',
          top: '50%',
          transform: 'translateY(-50%)',
        },
      },
      {
        '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      },
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
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
