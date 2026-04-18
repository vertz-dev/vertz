import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, keyframes, token } from '@vertz/ui';
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
    accordionItem: { borderBottomWidth: '1', borderColor: token.color.border },
    accordionTrigger: [
      'flex',
      'w:full',
      'items:center',
      'justify:between',
      'px:2',
      'text:sm',
      'font:medium',
      'text:foreground',
      'cursor:pointer',
      'bg:transparent',
      {
        '&': {
          border: 'none',
          'border-radius': 'calc(var(--radius) * 1.33)',
          'padding-top': '0.625rem',
          'padding-bottom': '0.625rem',
        },
        '&:hover': { 'text-decoration': 'underline' },
      },
    ],
    accordionContent: [
      'overflow-hidden',
      'text:sm',
      'text:muted-foreground',
      {
        '&[data-state="open"]:not([data-initial])': [
          animationDecl(`${accordionDown} 200ms ease-out forwards`),
        ],
      },
      {
        '&[data-state="closed"]': [animationDecl(`${accordionUp} 200ms ease-out forwards`)],
      },
      {
        '& [data-part="content-inner"]': {
          'padding-bottom': '1rem',
          'padding-top': '0',
        },
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
