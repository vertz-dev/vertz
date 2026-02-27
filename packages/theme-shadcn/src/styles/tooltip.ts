import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type TooltipBlocks = {
  content: StyleEntry[];
};

/** Create tooltip css() styles. */
export function createTooltipStyles(): CSSOutput<TooltipBlocks> {
  const s = css({
    tooltipContent: [
      'z:50',
      'overflow-hidden',
      'bg:primary',
      'text:primary-foreground',
      'rounded:md',
      'shadow:md',
      'px:3',
      'py:1.5',
      'text:xs',
      { '&[data-state="closed"]': ['hidden'] },
    ],
  });
  return {
    content: s.tooltipContent,
    css: s.css,
  } as CSSOutput<TooltipBlocks>;
}
