import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, keyframes, token } from '@vertz/ui';

type SkeletonBlocks = {
  root: StyleBlock;
  textRoot: StyleBlock;
  textLine: StyleBlock;
  circleRoot: StyleBlock;
};

const pulse = keyframes('vz-skeleton-pulse', {
  '0%, 100%': { opacity: '1' },
  '50%': { opacity: '0.5' },
});

const skeletonBase = {
  backgroundColor: token.color.muted,
  borderRadius: token.radius.md,
  '&': { animation: `${pulse} 2s ease-in-out infinite` },
};

/** Create skeleton css() styles. */
export function createSkeletonStyles(): CSSOutput<SkeletonBlocks> {
  const s = css({
    root: { ...skeletonBase },
    textRoot: { display: 'flex', flexDirection: 'column' },
    textLine: { height: token.spacing[4], ...skeletonBase },
    circleRoot: {
      ...skeletonBase,
      '&': { animation: `${pulse} 2s ease-in-out infinite`, borderRadius: '50%' },
    },
  });
  return {
    root: s.root,
    textRoot: s.textRoot,
    textLine: s.textLine,
    circleRoot: s.circleRoot,
    css: s.css,
  } as CSSOutput<SkeletonBlocks>;
}
