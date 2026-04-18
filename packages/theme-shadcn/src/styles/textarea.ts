import type { CSSOutput, StyleBlock } from '@vertz/ui';
import { css, token } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type TextareaBlocks = { base: StyleBlock };

/** Create textarea css() styles. */
export function createTextarea(): CSSOutput<TextareaBlocks> {
  const focusRing = {
    '&:focus-visible': {
      borderColor: token.color.ring,
      outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
      outlineOffset: '2px',
    },
  };

  const s = css({
    textareaBase: {
      display: 'flex',
      width: '100%',
      borderRadius: token.radius.lg,
      borderWidth: '1px',
      borderColor: token.color.input,
      backgroundColor: 'transparent',
      paddingBlock: token.spacing[2],
      fontSize: token.font.size.sm,
      color: token.color.foreground,
      transition:
        'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      '&': {
        paddingLeft: '0.625rem',
        paddingRight: '0.625rem',
        minHeight: '60px',
        fieldSizing: 'content',
      },
      ...focusRing,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
      [DARK]: bgOpacity('input', 30),
    },
  });
  return {
    base: s.textareaBase,
    css: s.css,
  } as CSSOutput<TextareaBlocks>;
}
