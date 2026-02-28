import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity } from './_helpers';

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
      { '&': [bgOpacity('primary', 20)] },
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
