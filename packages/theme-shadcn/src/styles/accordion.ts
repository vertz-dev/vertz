import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type AccordionBlocks = {
  item: StyleEntry[];
  trigger: StyleEntry[];
  content: StyleEntry[];
};

/** Create accordion css() styles. */
export function createAccordionStyles(): CSSOutput<AccordionBlocks> {
  const s = css({
    accordionItem: ['border-b:1', 'border:border'],
    accordionTrigger: [
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
    accordionContent: ['text:sm', 'pb:4', { '&[data-state="closed"]': ['hidden'] }],
  });
  return {
    item: s.accordionItem,
    trigger: s.accordionTrigger,
    content: s.accordionContent,
    css: s.css,
  } as CSSOutput<AccordionBlocks>;
}
