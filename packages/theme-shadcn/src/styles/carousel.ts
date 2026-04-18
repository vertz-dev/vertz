import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type CarouselBlocks = {
  root: StyleBlock;
  viewport: StyleBlock;
  slide: StyleBlock;
  prevButton: StyleBlock;
  nextButton: StyleBlock;
};

/** Create carousel css() styles following shadcn conventions. */
export function createCarouselStyles(): CSSOutput<CarouselBlocks> {
  const s = css({
    carouselRoot: { position: 'relative' },
    carouselViewport: { overflow: 'hidden' },
    carouselSlide: { '&[data-state="inactive"]': { display: 'none' } },
    carouselPrevButton: {
      position: 'absolute',
      height: token.spacing[8],
      width: token.spacing[8],
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      '&': { left: '0.5rem', top: '50%', transform: 'translateY(-50%)' },
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
    carouselNextButton: {
      position: 'absolute',
      height: token.spacing[8],
      width: token.spacing[8],
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.background,
      color: token.color.foreground,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      '&': { right: '0.5rem', top: '50%', transform: 'translateY(-50%)' },
      '&:hover': { backgroundColor: token.color.accent, color: token.color['accent-foreground'] },
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
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
