import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type CheckboxBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
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
      'rounded:sm',
      'border:1',
      'border:primary',
      'shadow:xs',
      'cursor:pointer',
      'transition:colors',
      { '&': [{ property: 'padding', value: '0' }] },
      { '&': [{ property: 'background', value: 'transparent' }] },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': ['bg:primary', 'text:primary-foreground'],
        '&[data-state="indeterminate"]': ['bg:primary', 'text:primary-foreground'],
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
