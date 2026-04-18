import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type ProgressBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
};

/** Create progress css() styles. */
export function createProgressStyles(): CSSOutput<ProgressBlocks> {
  const s = css({
    progressRoot: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
      borderRadius: token.radius.full,
      backgroundColor: token.color.muted,
      '&': { height: '0.25rem' },
    },
    progressIndicator: {
      height: '100%',
      width: '100%',
      backgroundColor: token.color.primary,
      '&': { transition: 'all 150ms' },
    },
  });
  return {
    root: s.progressRoot,
    indicator: s.progressIndicator,
    css: s.css,
  } as CSSOutput<ProgressBlocks>;
}
