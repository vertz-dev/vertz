import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes } from '@vertz/ui';

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

const skeletonBase = [
  'bg:muted',
  'rounded:md',
  { '&': { animation: `${pulse} 2s ease-in-out infinite` } },
] as const;

/** Create skeleton css() styles. */
export function createSkeletonStyles(): CSSOutput<SkeletonBlocks> {
  return css({
    root: [...skeletonBase],
    textRoot: ['flex', 'flex-col'],
    textLine: [...skeletonBase, 'h:4'],
    circleRoot: [...skeletonBase, { '&': { borderRadius: '50%' } }],
  });
}
