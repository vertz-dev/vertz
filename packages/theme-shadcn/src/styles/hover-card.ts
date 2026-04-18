import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type HoverCardBlocks = {
  content: StyleBlock;
};

/** Create hover card css() styles. */
export function createHoverCardStyles(): CSSOutput<HoverCardBlocks> {
  const s = css({
    hoverCardContent: {
      zIndex: '50',
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.border,
      backgroundColor: token.color.popover,
      color: token.color['popover-foreground'],
      boxShadow: token.shadow.md,
      outline: 'none',
      padding: token.spacing[4],
      '&': { width: '16rem' },
      '&[data-state="open"]': animationDecl(
        'vz-fade-in 150ms ease-out forwards, vz-zoom-in 150ms ease-out forwards',
      ),
      '&[data-state="closed"]': animationDecl(
        'vz-fade-out 150ms ease-out forwards, vz-zoom-out 150ms ease-out forwards',
      ),
    },
  });
  return {
    content: s.hoverCardContent,
    css: s.css,
  } as CSSOutput<HoverCardBlocks>;
}
