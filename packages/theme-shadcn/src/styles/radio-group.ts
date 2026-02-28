import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type RadioGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
  indicator: StyleEntry[];
  indicatorIcon: StyleEntry[];
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

/** Create radio group css() styles. */
export function createRadioGroupStyles(): CSSOutput<RadioGroupBlocks> {
  const s = css({
    radioGroupRoot: ['grid', 'gap:2'],
    radioGroupItem: [
      'flex',
      'items:center',
      'justify:center',
      'h:4',
      'w:4',
      'shrink-0',
      'rounded:full',
      'border:1',
      'border:input',
      'cursor:pointer',
      'transition:colors',
      {
        '&': [
          { property: 'aspect-ratio', value: '1 / 1' },
          { property: 'padding', value: '0' },
          { property: 'background', value: 'transparent' },
        ],
      },
      { [DARK]: [bgOpacity('input', 30)] },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': [
          'bg:primary',
          'text:primary-foreground',
          'border:primary',
        ],
      },
      {
        '&[data-state="unchecked"]': ['bg:transparent'],
      },
    ],
    radioGroupIndicator: [
      'flex',
      'h:4',
      'w:4',
      'items:center',
      'justify:center',
      {
        '&[data-state="unchecked"]': [{ property: 'display', value: 'none' }],
      },
    ],
    radioGroupIndicatorIcon: [
      'rounded:full',
      'h:2',
      'w:2',
      'bg:primary-foreground',
      {
        '&': [
          { property: 'position', value: 'absolute' },
          { property: 'top', value: '50%' },
          { property: 'left', value: '50%' },
          { property: 'transform', value: 'translate(-50%, -50%)' },
        ],
      },
    ],
  });
  return {
    root: s.radioGroupRoot,
    item: s.radioGroupItem,
    indicator: s.radioGroupIndicator,
    indicatorIcon: s.radioGroupIndicatorIcon,
    css: s.css,
  } as CSSOutput<RadioGroupBlocks>;
}
