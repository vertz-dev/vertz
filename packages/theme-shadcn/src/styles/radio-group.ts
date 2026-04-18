import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type RadioGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
  indicator: StyleEntry[];
  indicatorIcon: StyleEntry[];
};

const focusRing: Record<string, StyleValue[]> = {
  '&:focus-visible': [
    'outline-none',
    'border:ring',
    {
      'box-shadow': '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
  ],
};

/** Create radio group css() styles. */
export function createRadioGroupStyles(): CSSOutput<RadioGroupBlocks> {
  const s = css({
    radioGroupRoot: { display: 'grid', gap: token.spacing[2] },
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
        '&': {
          'aspect-ratio': '1 / 1',
          padding: '0',
          background: 'transparent',
        },
      },
      { [DARK]: [bgOpacity('input', 30)] },
      focusRing,
      { '&:disabled': { pointerEvents: 'none', opacity: '0.5' } },
      {
        '&[data-state="checked"]': {
          backgroundColor: token.color.primary,
          color: token.color['primary-foreground'],
          borderColor: token.color.primary,
        },
      },
      {
        '&[data-state="unchecked"]': { backgroundColor: 'transparent' },
      },
    ],
    radioGroupIndicator: [
      'flex',
      'h:4',
      'w:4',
      'items:center',
      'justify:center',
      {
        '&[data-state="unchecked"]': [{ display: 'none' }],
      },
    ],
    radioGroupIndicatorIcon: [
      'rounded:full',
      'h:2',
      'w:2',
      'bg:primary-foreground',
      {
        '&': {
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        },
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
