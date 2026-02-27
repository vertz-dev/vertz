import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type LabelBlocks = { base: string[] };

/** Create label css() styles. */
export function createLabel(): CSSOutput<LabelBlocks> {
  const s = css({
    labelBase: ['text:sm', 'font:medium', 'leading:none', 'text:foreground'],
  });
  return {
    base: s.labelBase,
    css: s.css,
  } as CSSOutput<LabelBlocks>;
}
