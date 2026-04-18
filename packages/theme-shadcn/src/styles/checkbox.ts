import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type CheckboxBlocks = {
  root: StyleBlock;
  indicator: StyleBlock;
};

const focusRing = {
  '&:focus-visible': {
    outline: 'none',
    borderColor: token.color.ring,
    boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
  },
};

/** Create checkbox css() styles. */
export function createCheckboxStyles(): CSSOutput<CheckboxBlocks> {
  const s = css({
    checkboxRoot: {
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: token.spacing[4],
      width: token.spacing[4],
      borderWidth: '1px',
      borderColor: token.color.input,
      cursor: 'pointer',
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&': { padding: '0', background: 'transparent', borderRadius: 'calc(var(--radius) * 0.67)' },
      [DARK]: bgOpacity('input', 30),
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="checked"]': {
        backgroundColor: token.color.primary,
        color: token.color['primary-foreground'],
        borderColor: token.color.primary,
      },
      '&[data-state="indeterminate"]': {
        backgroundColor: token.color.primary,
        color: token.color['primary-foreground'],
        borderColor: token.color.primary,
      },
    },
    checkboxIndicator: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '& [data-part="indicator-icon"]': {
        position: 'absolute',
        inset: '0',
        opacity: '0',
        transform: 'scale(0.5)',
        transition:
          'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1), ' +
          'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
      '& [data-icon="check"] path': {
        strokeDasharray: '30',
        strokeDashoffset: '30',
        transition: 'stroke-dashoffset 200ms cubic-bezier(0.4, 0, 0.2, 1) 50ms',
      },
      '&[data-state="checked"] [data-icon="check"]': { opacity: '1', transform: 'scale(1)' },
      '&[data-state="checked"] [data-icon="check"] path': { strokeDashoffset: '0' },
      '&[data-state="indeterminate"] [data-icon="minus"]': { opacity: '1', transform: 'scale(1)' },
    },
  });
  return {
    root: s.checkboxRoot,
    indicator: s.checkboxIndicator,
    css: s.css,
  } as CSSOutput<CheckboxBlocks>;
}
