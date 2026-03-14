import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type TextareaBlocks = { base: StyleEntry[] };

/** Create textarea css() styles. */
export function createTextarea(): CSSOutput<TextareaBlocks> {
  const focusRing: Record<string, StyleValue[]> = {
    '&:focus-visible': [
      'outline-none',
      'border:ring',
      {
        outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
      },
      { 'outline-offset': '2px' },
    ],
  };

  const s = css({
    textareaBase: [
      'flex',
      'w:full',
      'rounded:lg',
      'border:1',
      'border:input',
      'bg:transparent',
      'py:2',
      {
        '&': {
          'padding-left': '0.625rem',
          'padding-right': '0.625rem',
          'min-height': '60px',
          'field-sizing': 'content',
        },
      },
      'text:sm',
      'text:foreground',
      'transition:colors',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      { [DARK]: [bgOpacity('input', 30)] },
    ],
  });
  return {
    base: s.textareaBase,
    css: s.css,
  } as CSSOutput<TextareaBlocks>;
}
