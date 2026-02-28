import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type HoverCardBlocks = {
  content: StyleEntry[];
};

/** Create hover card css() styles. */
export function createHoverCardStyles(): CSSOutput<HoverCardBlocks> {
  const s = css({
    hoverCardContent: [
      'z:50',
      'rounded:md',
      'border:1',
      'border:border',
      'bg:popover',
      'text:popover-foreground',
      'shadow:md',
      'p:4',
      {
        '&': [{ property: 'width', value: '16rem' }],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-fade-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-fade-out 150ms ease-out forwards')],
      },
    ],
  });
  return {
    content: s.hoverCardContent,
    css: s.css,
  } as CSSOutput<HoverCardBlocks>;
}
