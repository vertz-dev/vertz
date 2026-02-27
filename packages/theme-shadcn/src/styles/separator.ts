import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type SeparatorBlocks = { base: string[] };

/** Create separator css() styles. */
export function createSeparator(): CSSOutput<SeparatorBlocks> {
  return css({
    base: ['bg:border', 'h:0.5', 'w:full'],
  });
}
