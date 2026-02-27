import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type ProgressBlocks = {
  root: string[];
  indicator: string[];
};

/** Create progress css() styles. */
export function createProgressStyles(): CSSOutput<ProgressBlocks> {
  return css({
    root: ['relative', 'h:4', 'w:full', 'rounded:full', 'bg:secondary'],
    indicator: ['h:full', 'w:full', 'bg:primary', 'transition:transform'],
  });
}
