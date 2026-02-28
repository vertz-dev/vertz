import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type TooltipBlocks = {
  content: StyleEntry[];
};

/** Create tooltip css() styles. */
export function createTooltipStyles(): CSSOutput<TooltipBlocks> {
  const s = css({
    // Nova: rounded-md px-3 py-1.5 text-xs
    tooltipContent: [
      'z:50',
      'bg:primary',
      'text:primary-foreground',
      'rounded:md',
      'px:3',
      'py:1.5',
      'text:xs',
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 100ms ease-out forwards')],
      },
    ],
  });
  return {
    content: s.tooltipContent,
    css: s.css,
  } as CSSOutput<TooltipBlocks>;
}
