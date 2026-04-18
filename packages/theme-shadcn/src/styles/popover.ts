import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type PopoverBlocks = {
  content: StyleEntry[];
};

/** Create popover css() styles. */
export function createPopoverStyles(): CSSOutput<PopoverBlocks> {
  const s = css({
    popoverContent: {
      zIndex: '50',
      overflow: 'hidden',
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      borderRadius: token.radius.lg,
      width: 'fit-content',
      display: 'flex',
      flexDirection: 'column',
      gap: token.spacing['2.5'],
      padding: token.spacing['2.5'],
      fontSize: token.font.size.sm,
      '&': {
        boxShadow:
          '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
      '&[data-state="open"]': animationDecl('vz-zoom-in 100ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-zoom-out 100ms ease-out forwards'),
    },
  });
  return {
    content: s.popoverContent,
    css: s.css,
  } as CSSOutput<PopoverBlocks>;
}
