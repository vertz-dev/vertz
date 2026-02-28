import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type SeparatorBlocks = { base: string[] };

/** Create separator css() styles. */
export function createSeparator(): CSSOutput<SeparatorBlocks> {
  const s = css({
    separatorBase: ['bg:border', 'w:full', { '&': [{ property: 'height', value: '1px' }] }],
  });
  return {
    base: s.separatorBase,
    css: s.css,
  } as CSSOutput<SeparatorBlocks>;
}
