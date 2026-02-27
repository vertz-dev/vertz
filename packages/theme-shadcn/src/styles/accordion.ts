import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { animationDecl } from './_helpers';

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
      'transition:colors',
      'hover:text:foreground',
      { '&[data-state="open"]': ['font:semibold'] },
    ],
    accordionContent: [
      'overflow-hidden',
      'text:sm',
      'pb:4',
      {
        '&[data-state="open"]': [animationDecl('vz-accordion-down 200ms ease-out forwards')],
      },
      {
        '&[data-state="closed"]': [animationDecl('vz-accordion-up 200ms ease-out forwards')],
      },
    ],
  });
  return {
    item: s.accordionItem,
    trigger: s.accordionTrigger,
    content: s.accordionContent,
    css: s.css,
  } as CSSOutput<AccordionBlocks>;
}
