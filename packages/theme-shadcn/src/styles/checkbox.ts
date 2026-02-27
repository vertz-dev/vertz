import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type CheckboxBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
};

/** Create checkbox css() styles. */
export function createCheckboxStyles(): CSSOutput<CheckboxBlocks> {
  const s = css({
    checkboxRoot: [
      'h:4',
      'w:4',
      'rounded:sm',
      'border:1',
      'border:input',
      'cursor:pointer',
      'focus-visible:outline-none',
      'focus-visible:ring:2',
      'focus-visible:ring:ring',
      'disabled:opacity:0.5',
      'disabled:cursor:default',
      {
        '&[data-state="checked"]': ['bg:primary', 'text:primary-foreground', 'border:primary'],
        '&[data-state="indeterminate"]': [
          'bg:primary',
          'text:primary-foreground',
          'border:primary',
        ],
      },
    ],
    checkboxIndicator: [
      'flex',
      'items:center',
      'justify:center',
      { '&[data-state="unchecked"]': ['hidden'] },
    ],
  });
  return {
    root: s.checkboxRoot,
    indicator: s.checkboxIndicator,
    css: s.css,
  } as CSSOutput<CheckboxBlocks>;
}
