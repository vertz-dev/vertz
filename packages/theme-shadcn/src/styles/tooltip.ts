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
      'bg:card',
      'text:card-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'px:3',
      'py:1.5',
      'text:sm',
      { '&[data-state="closed"]': ['hidden'] },
    ],
  });
  return {
    content: s.tooltipContent,
    css: s.css,
  } as CSSOutput<TooltipBlocks>;
}
