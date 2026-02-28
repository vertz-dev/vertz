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
      'rounded:lg',
      'flex',
      'flex-col',
      'gap:2.5',
      'p:2.5',
      'text:sm',
      // Positioning: portaled to body, positioned via JS
      {
        '&': [
          { property: 'position', value: 'fixed' },
        ],
      },
      // Nova: ring-1 ring-foreground/10 instead of border, shadow-md
      {
        '&': [
          {
            property: 'box-shadow',
            value:
              '0 0 0 1px color-mix(in oklch, var(--color-foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          },
        ],
      },
      {
        '&[data-state="open"]': [animationDecl('vz-zoom-in 100ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-zoom-out 100ms ease-out forwards')],
      },
    ],
  });
  return {
    content: s.popoverContent,
    css: s.css,
  } as CSSOutput<PopoverBlocks>;
}
