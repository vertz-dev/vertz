import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type TooltipBlocks = {
  content: StyleEntry[];
};

/** Create tooltip css() styles. */
export function createTooltipStyles(): CSSOutput<TooltipBlocks> {
  const s = css({
    // Nova: rounded-md px-3 py-1.5 text-xs
    tooltipContent: {
      zIndex: '50',
      backgroundColor: token.color.primary,
      color: token.color['primary-foreground'],
      borderRadius: token.radius.md,
      paddingInline: token.spacing[3],
      paddingBlock: token.spacing['1.5'],
      fontSize: token.font.size.xs,
      '&': { whiteSpace: 'nowrap' },
      '&[data-state="open"]': animationDecl('vz-fade-in 100ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-fade-out 100ms ease-out forwards'),
    },
  });
  return {
    content: s.tooltipContent,
    css: s.css,
  } as CSSOutput<TooltipBlocks>;
}
