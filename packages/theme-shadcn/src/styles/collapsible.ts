import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type CollapsibleBlocks = {
  content: StyleBlock;
};

/** Create collapsible css() styles. */
export function createCollapsibleStyles(): CSSOutput<CollapsibleBlocks> {
  const s = css({
    collapsibleContent: {
      overflow: 'hidden',
      fontSize: token.font.size.sm,
      '&[data-state="open"]': animationDecl('vz-collapsible-down 200ms ease-out forwards'),
      '&[data-state="closed"]': animationDecl('vz-collapsible-up 200ms ease-out forwards'),
    },
  });
  return {
    content: s.collapsibleContent,
    css: s.css,
  } as CSSOutput<CollapsibleBlocks>;
}
