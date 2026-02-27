import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type ProgressBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
};

/** Create progress css() styles. */
export function createProgressStyles(): CSSOutput<ProgressBlocks> {
  const s = css({
    progressRoot: [
      'relative',
      'h:2',
      'w:full',
      'overflow-hidden',
      'rounded:full',
      'bg:primary',
      'opacity:0.2',
    ],
    progressIndicator: [
      'h:full',
      'w:full',
      'flex-col',
      'bg:primary',
      'transition:transform',
      'rounded:full',
    ],
  });
  return {
    root: s.progressRoot,
    indicator: s.progressIndicator,
    css: s.css,
  } as CSSOutput<ProgressBlocks>;
}
