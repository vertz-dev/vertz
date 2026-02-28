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
      'w:full',
      'overflow-hidden',
      'rounded:full',
      'bg:muted',
      { '&': [{ property: 'height', value: '0.25rem' }] },
    ],
    progressIndicator: [
      'h:full',
      'w:full',
      'bg:primary',
      { '&': [{ property: 'transition', value: 'all 150ms' }] },
    ],
  });
  return {
    root: s.progressRoot,
    indicator: s.progressIndicator,
    css: s.css,
  } as CSSOutput<ProgressBlocks>;
}
