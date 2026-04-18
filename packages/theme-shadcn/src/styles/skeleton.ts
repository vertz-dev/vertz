import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes, token } from '@vertz/ui';

type SkeletonBlocks = {
  root: StyleEntry[];
  textRoot: StyleEntry[];
  textLine: StyleEntry[];
  circleRoot: StyleEntry[];
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
  return css({
    root: { ...skeletonBase },
    textRoot: { display: 'flex', flexDirection: 'column' },
    textLine: { height: token.spacing[4], ...skeletonBase },
    circleRoot: {
      ...skeletonBase,
      '&': { animation: `${pulse} 2s ease-in-out infinite`, borderRadius: '50%' },
    },
  });
}
