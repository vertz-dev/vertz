import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type LabelBlocks = { base: StyleEntry[] };

/** Create label css() styles. */
export function createLabel(): CSSOutput<LabelBlocks> {
  const s = css({
    labelBase: [
      'flex',
      'items:center',
      'gap:2',
      'text:sm',
      'font:medium',
      'leading:none',
      'text:foreground',
      'select-none',
      { '&:has(~ :disabled)': ['opacity:0.7', 'cursor:default'] },
    ],
  });
  return {
    base: s.labelBase,
    css: s.css,
  } as CSSOutput<LabelBlocks>;
}
