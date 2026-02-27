import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SelectBlocks = {
  trigger: StyleEntry[];
  content: StyleEntry[];
  item: StyleEntry[];
};

/** Create select css() styles. */
export function createSelectStyles(): CSSOutput<SelectBlocks> {
  const s = css({
    selectTrigger: [
      'flex',
      'h:10',
      'w:full',
      'items:center',
      'justify:between',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:background',
      'px:3',
      'py:2',
      'text:sm',
      'cursor:pointer',
      'focus-visible:outline-none',
      'focus-visible:ring:2',
      'focus-visible:ring:ring',
      'disabled:opacity:0.5',
      'disabled:cursor:default',
      { '&[data-state="open"]': ['border:ring'] },
    ],
    selectContent: [
      'z:50',
      'bg:card',
      'text:card-foreground',
      'rounded:md',
      'border:1',
      'border:border',
      'shadow:md',
      'py:1',
      { '&[data-state="closed"]': ['hidden'] },
    ],
    selectItem: [
      'flex',
      'items:center',
      'px:3',
      'py:1.5',
      'text:sm',
      'cursor:pointer',
      'hover:bg:accent',
      'hover:text:accent-foreground',
    ],
  });
  return {
    trigger: s.selectTrigger,
    content: s.selectContent,
    item: s.selectItem,
    css: s.css,
  } as CSSOutput<SelectBlocks>;
}
