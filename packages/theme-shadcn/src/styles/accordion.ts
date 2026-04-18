import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, keyframes, token } from '@vertz/ui';
import { animationDecl } from './_helpers';

type AccordionBlocks = {
  item: StyleBlock;
  trigger: StyleBlock;
  content: StyleBlock;
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
    accordionItem: { borderBottomWidth: '1px', borderColor: token.color.border },
    accordionTrigger: {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingInline: token.spacing[2],
      fontSize: token.font.size.sm,
      fontWeight: token.font.weight.medium,
      color: token.color.foreground,
      cursor: 'pointer',
      backgroundColor: 'transparent',
      '&': {
        border: 'none',
        borderRadius: 'calc(var(--radius) * 1.33)',
        paddingTop: '0.625rem',
        paddingBottom: '0.625rem',
      },
      '&:hover': { textDecoration: 'underline' },
    },
    accordionContent: {
      overflow: 'hidden',
      fontSize: token.font.size.sm,
      color: token.color['muted-foreground'],
      '&[data-state="open"]:not([data-initial])': animationDecl(
        `${accordionDown} 200ms ease-out forwards`,
      ),
      '&[data-state="closed"]': animationDecl(`${accordionUp} 200ms ease-out forwards`),
      '& [data-part="content-inner"]': { paddingBottom: '1rem', paddingTop: '0' },
    },
  });
  return {
    item: s.accordionItem,
    trigger: s.accordionTrigger,
    content: s.accordionContent,
    css: s.css,
  } as CSSOutput<AccordionBlocks>;
}
