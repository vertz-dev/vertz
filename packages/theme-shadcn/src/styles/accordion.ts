import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type AccordionBlocks = {
  item: StyleEntry[];
  trigger: StyleEntry[];
  content: StyleEntry[];
};

/** Create accordion css() styles. */
export function createAccordionStyles(): CSSOutput<AccordionBlocks> {
  return css({
    item: ['border-b:1', 'border:border'],
    trigger: [
      'flex',
      'w:full',
      'items:center',
      'justify:between',
      'py:4',
      'font:medium',
      'text:sm',
      'cursor:pointer',
      { '&[data-state="open"]': ['font:semibold'] },
    ],
    content: ['text:sm', 'pb:4', { '&[data-state="closed"]': ['hidden'] }],
  });
}
