import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes } from '@vertz/ui';

type SkeletonBlocks = {
  base: StyleEntry[];
};

const pulse = keyframes('vz-skeleton-pulse', {
  '0%, 100%': { opacity: '1' },
  '50%': { opacity: '0.5' },
});

/** Create skeleton css() styles. */
export function createSkeletonStyles(): CSSOutput<SkeletonBlocks> {
  return css({
    base: [
      'bg:accent',
      'rounded:md',
      { '&': [{ property: 'animation', value: `${pulse} 2s ease-in-out infinite` }] },
    ],
  });
}
