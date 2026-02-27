import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type ProgressBlocks = {
  root: string[];
  indicator: string[];
};

/** Create progress css() styles. */
export function createProgressStyles(): CSSOutput<ProgressBlocks> {
  const s = css({
    progressRoot: ['relative', 'h:4', 'w:full', 'rounded:full', 'bg:secondary'],
    progressIndicator: ['h:full', 'w:full', 'bg:primary', 'transition:transform'],
  });
  return {
    root: s.progressRoot,
    indicator: s.progressIndicator,
    css: s.css,
  } as CSSOutput<ProgressBlocks>;
}
