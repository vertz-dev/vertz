import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes } from '@vertz/ui';
import { animationDecl } from './_helpers';

type AccordionBlocks = {
  item: StyleEntry[];
  trigger: StyleEntry[];
  content: StyleEntry[];
};

const accordionDown = keyframes('vz-accordion-down', {
  from: { height: '0', opacity: '0' },
  to: { height: 'var(--accordion-content-height)', opacity: '1' },
});

const accordionUp = keyframes('vz-accordion-up', {
  from: { height: 'var(--accordion-content-height)', opacity: '1' },
  to: { height: '0', opacity: '0' },
});

/** Create accordion css() styles. */
export function createAccordionStyles(): CSSOutput<AccordionBlocks> {
  const s = css({
    accordionItem: ['border-b:1', 'border:border'],
    accordionTrigger: [
      'flex',
      'w:full',
      'items:center',
      'justify:between',
      'px:2',
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
      {
        '&[data-state="open"]': [
          animationDecl(`${accordionDown} 200ms ease-out forwards`),
        ],
      },
      {
        '&[data-state="closed"]': [
          animationDecl(`${accordionUp} 200ms ease-out forwards`),
        ],
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
