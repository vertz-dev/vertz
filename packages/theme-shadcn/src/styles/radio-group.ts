import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type RadioGroupBlocks = {
  root: StyleEntry[];
  item: StyleEntry[];
  indicator: StyleEntry[];
  indicatorIcon: StyleEntry[];
};

const focusRing = {
  '&:focus-visible': {
    outline: 'none',
    borderColor: token.color.ring,
    boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
  },
};

/** Create radio group css() styles. */
export function createRadioGroupStyles(): CSSOutput<RadioGroupBlocks> {
  const s = css({
    radioGroupRoot: { display: 'grid', gap: token.spacing[2] },
    radioGroupItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: token.spacing[4],
      width: token.spacing[4],
      flexShrink: '0',
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: token.color.input,
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&': { aspectRatio: '1 / 1', padding: '0', background: 'transparent' },
      [DARK]: bgOpacity('input', 30),
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="checked"]': {
        backgroundColor: token.color.primary,
        color: token.color['primary-foreground'],
        borderColor: token.color.primary,
      },
      '&[data-state="unchecked"]': { backgroundColor: 'transparent' },
    },
    radioGroupIndicator: {
      display: 'flex',
      height: token.spacing[4],
      width: token.spacing[4],
      alignItems: 'center',
      justifyContent: 'center',
      '&[data-state="unchecked"]': { display: 'none' },
    },
    radioGroupIndicatorIcon: {
      borderRadius: token.radius.full,
      height: token.spacing[2],
      width: token.spacing[2],
      backgroundColor: token.color['primary-foreground'],
      '&': { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    },
  });
  return {
    root: s.radioGroupRoot,
    item: s.radioGroupItem,
    indicator: s.radioGroupIndicator,
    indicatorIcon: s.radioGroupIndicatorIcon,
    css: s.css,
  } as CSSOutput<RadioGroupBlocks>;
}
