import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type LabelBlocks = { base: StyleEntry[] };

/** Create label css() styles. */
export function createLabel(): CSSOutput<LabelBlocks> {
  const s = css({
    labelBase: {
      display: 'flex',
      alignItems: 'center',
      gap: token.spacing[2],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      lineHeight: token.font.lineHeight.none,
      color: token.color.foreground,
      userSelect: 'none',
      '&:has(~ :disabled)': { opacity: '0.7', cursor: 'default' },
    },
  });
  return {
    base: s.labelBase,
    css: s.css,
  } as CSSOutput<LabelBlocks>;
}
