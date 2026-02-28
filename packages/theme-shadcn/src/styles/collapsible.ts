import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type CollapsibleBlocks = {
  content: StyleEntry[];
};

/** Create collapsible css() styles. */
export function createCollapsibleStyles(): CSSOutput<CollapsibleBlocks> {
  const s = css({
    collapsibleContent: [
      'overflow-hidden',
      'text:sm',
      {
        '&[data-state="open"]': [animationDecl('vz-collapsible-down 200ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-collapsible-up 200ms ease-out forwards')],
      },
    ],
  });
  return {
    content: s.collapsibleContent,
    css: s.css,
  } as CSSOutput<CollapsibleBlocks>;
}
