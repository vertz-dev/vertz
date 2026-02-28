import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type RadioGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
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

/** Create radio group css() styles. */
export function createRadioGroupStyles(): CSSOutput<RadioGroupBlocks> {
  const s = css({
    radioGroupRoot: ['grid', 'gap:3'],
    radioGroupItem: [
      'h:4',
      'w:4',
      'shrink-0',
      'rounded:full',
      'border:1',
      'border:input',
      'shadow:xs',
      'cursor:pointer',
      'transition:colors',
      {
        '&': [{ property: 'aspect-ratio', value: '1 / 1' }],
      },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': ['bg:primary', 'text:primary-foreground', 'border:primary'],
      },
      {
        '&[data-state="unchecked"]': ['bg:transparent'],
      },
      {
        [`${DARK}[data-state="unchecked"]`]: [bgOpacity('input', 30)],
      },
    ],
    radioGroupIndicator: [
      'flex',
      'items:center',
      'justify:center',
      {
        '&[data-state="unchecked"]': [{ property: 'display', value: 'none' }],
      },
    ],
  });
  return {
    root: s.radioGroupRoot,
    item: s.radioGroupItem,
    indicator: s.radioGroupIndicator,
    css: s.css,
  } as CSSOutput<RadioGroupBlocks>;
}
