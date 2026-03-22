import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type CheckboxBlocks = {
  root: StyleEntry[];
  indicator: StyleEntry[];
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
      { '&': { padding: '0', background: 'transparent', 'border-radius': 'calc(var(--radius) * 0.67)' } },
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
      'relative',
      'flex',
      'items:center',
      'justify:center',
      // Both SVGs are always in the DOM, stacked absolutely.
      // CSS controls which icon is visible based on the indicator's data-state.
      {
        '& [data-part="indicator-icon"]': {
          position: 'absolute',
          inset: '0',
          opacity: '0',
          transform: 'scale(0.5)',
          transition:
            'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1), ' +
            'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        },
        // Checkmark draw animation via stroke-dashoffset
        '& [data-icon="check"] path': {
          'stroke-dasharray': '30',
          'stroke-dashoffset': '30',
          transition: 'stroke-dashoffset 200ms cubic-bezier(0.4, 0, 0.2, 1) 50ms',
        },
        // Checked: show checkmark, draw the path
        '&[data-state="checked"] [data-icon="check"]': {
          opacity: '1',
          transform: 'scale(1)',
        },
        '&[data-state="checked"] [data-icon="check"] path': {
          'stroke-dashoffset': '0',
        },
        // Indeterminate: show minus icon
        '&[data-state="indeterminate"] [data-icon="minus"]': {
          opacity: '1',
          transform: 'scale(1)',
        },
      },
    ],
  });
  return {
    root: s.checkboxRoot,
    indicator: s.checkboxIndicator,
    css: s.css,
  } as CSSOutput<CheckboxBlocks>;
}
