import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SeparatorBlocks = {
  base: StyleEntry[];
  horizontal: StyleEntry[];
  vertical: StyleEntry[];
};

/** Create separator css() styles. */
export function createSeparator(): CSSOutput<SeparatorBlocks> {
  const s = css({
    separatorBase: ['bg:border', 'shrink-0'],
    separatorHorizontal: ['w:full', { '&': [{ property: 'height', value: '1px' }] }],
    separatorVertical: [{ '&': [{ property: 'height', value: '100%' }, { property: 'width', value: '1px' }] }],
  });
  return {
    base: s.separatorBase,
    horizontal: s.separatorHorizontal,
    vertical: s.separatorVertical,
    css: s.css,
  } as CSSOutput<SeparatorBlocks>;
}
