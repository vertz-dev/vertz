import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type SwitchBlocks = {
  root: StyleEntry[];
  thumb: StyleEntry[];
  rootSm: StyleEntry[];
  thumbSm: StyleEntry[];
};

const focusRing = {
  '&:focus-visible': {
    outline: 'none',
    borderColor: token.color.ring,
    boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
  },
};

/** Create switch css() styles. */
export function createSwitchStyles(): CSSOutput<SwitchBlocks> {
  const s = css({
    switchRoot: {
      display: 'inline-flex',
      flexShrink: '0',
      alignItems: 'center',
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: 'transparent',
      cursor: 'pointer',
      backgroundColor: token.color.input,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      height: token.spacing[5],
      width: token.spacing[8],
      [DARK]: bgOpacity('input', 80),
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="checked"]': { backgroundColor: token.color.primary },
      '&[data-state="unchecked"]': { backgroundColor: token.color.input },
    },
    switchThumb: {
      display: 'block',
      height: token.spacing[4],
      width: token.spacing[4],
      borderRadius: token.radius.full,
      backgroundColor: token.color.background,
      '&': {
        transition:
          'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
      '&[data-state="unchecked"]': { transform: 'translateX(0)' },
      '&[data-state="checked"]': { transform: 'translateX(calc(100% - 2px))' },
      'button:active > &[data-state="unchecked"]': {
        width: token.spacing[5],
        transform: 'translateX(0)',
      },
      'button:active > &[data-state="checked"]': {
        width: token.spacing[5],
        transform: 'translateX(0.625rem)',
      },
      [`${DARK}[data-state="unchecked"]`]: { backgroundColor: 'var(--color-foreground)' },
      [`${DARK}[data-state="checked"]`]: { backgroundColor: 'var(--color-primary-foreground)' },
    },
    switchRootSm: {
      display: 'inline-flex',
      flexShrink: '0',
      alignItems: 'center',
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: 'transparent',
      cursor: 'pointer',
      backgroundColor: token.color.input,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      height: token.spacing['3.5'],
      width: token.spacing[6],
      [DARK]: bgOpacity('input', 80),
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      '&[data-state="checked"]': { backgroundColor: token.color.primary },
      '&[data-state="unchecked"]': { backgroundColor: token.color.input },
    },
    switchThumbSm: {
      display: 'block',
      height: token.spacing[3],
      width: token.spacing[3],
      borderRadius: token.radius.full,
      backgroundColor: token.color.background,
      '&': {
        transition:
          'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
      '&[data-state="unchecked"]': { transform: 'translateX(0)' },
      '&[data-state="checked"]': { transform: 'translateX(calc(100% - 2px))' },
      'button:active > &[data-state="unchecked"]': {
        width: token.spacing['3.5'],
        transform: 'translateX(0)',
      },
      'button:active > &[data-state="checked"]': {
        width: token.spacing['3.5'],
        transform: 'translateX(0.5rem)',
      },
      [`${DARK}[data-state="unchecked"]`]: { backgroundColor: 'var(--color-foreground)' },
      [`${DARK}[data-state="checked"]`]: { backgroundColor: 'var(--color-primary-foreground)' },
    },
  });
  return {
    root: s.switchRoot,
    thumb: s.switchThumb,
    rootSm: s.switchRootSm,
    thumbSm: s.switchThumbSm,
    css: s.css,
  } as CSSOutput<SwitchBlocks>;
}
