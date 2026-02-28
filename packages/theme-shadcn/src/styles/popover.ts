import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

type PopoverBlocks = {
  content: StyleEntry[];
};

/** Create popover css() styles. */
export function createPopoverStyles(): CSSOutput<PopoverBlocks> {
  const s = css({
    popoverContent: [
      'z:50',
      'overflow-hidden',
      'bg:popover',
      'text:popover-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'p:4',
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 150ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 150ms ease-out forwards')],
      },
    ],
  });
  return {
    content: s.popoverContent,
    css: s.css,
  } as CSSOutput<PopoverBlocks>;
}
