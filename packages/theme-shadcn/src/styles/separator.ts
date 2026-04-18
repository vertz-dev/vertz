import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type SeparatorBlocks = {
  base: StyleBlock;
  horizontal: StyleBlock;
  vertical: StyleBlock;
};

/** Create separator css() styles. */
export function createSeparator(): CSSOutput<SeparatorBlocks> {
  const s = css({
    separatorBase: { backgroundColor: token.color.border, flexShrink: '0' },
    separatorHorizontal: { width: '100%', '&': { height: '1px' } },
    separatorVertical: { '&': { height: '100%', width: '1px' } },
  });
  return {
    base: s.separatorBase,
    horizontal: s.separatorHorizontal,
    vertical: s.separatorVertical,
    css: s.css,
  } as CSSOutput<SeparatorBlocks>;
}
