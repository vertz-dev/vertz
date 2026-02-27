import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type LabelBlocks = { base: string[] };

/** Create label css() styles. */
export function createLabel(): CSSOutput<LabelBlocks> {
  return css({
    base: ['text:sm', 'font:medium', 'leading:none', 'text:foreground'],
  });
}
