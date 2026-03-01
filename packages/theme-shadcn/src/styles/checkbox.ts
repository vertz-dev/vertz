import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type CheckboxBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    'border:ring',
    {
      property: 'box-shadow',
      value: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
  ],
};

/** Create checkbox css() styles. */
export function createCheckboxStyles(): CSSOutput<CheckboxBlocks> {
  const s = css({
    checkboxRoot: [
      'shrink-0',
      'flex',
      'items:center',
      'justify:center',
      'h:4',
      'w:4',
      'border:1',
      'border:input',
      'cursor:pointer',
      'transition:colors',
      { '&': [{ property: 'padding', value: '0' }] },
      { '&': [{ property: 'background', value: 'transparent' }] },
      { '&': [{ property: 'border-radius', value: '4px' }] },
      { [DARK]: [bgOpacity('input', 30)] },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
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
