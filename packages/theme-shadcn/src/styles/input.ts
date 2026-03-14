import type { CSSOutput, StyleEntry, StyleValue } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type InputBlocks = { base: StyleEntry[] };

/** Create input css() styles. */
export function createInput(): CSSOutput<InputBlocks> {
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
    inputBase: [
      'flex',
      'w:full',
      'rounded:lg',
      'border:1',
      'border:input',
      'bg:transparent',
      'py:1',
      {
        '&': {
          height: '2rem',
          'padding-left': '0.625rem',
          'padding-right': '0.625rem',
        },
      },
      'text:sm',
      'text:foreground',
      'transition:colors',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      { [DARK]: [bgOpacity('input', 30)] },
      {
        '&::file-selector-button': [
          'border:0',
          'bg:transparent',
          'text:sm',
          'font:medium',
          'text:foreground',
        ],
      },
    ],
  });
  return {
    base: s.inputBase,
    css: s.css,
  } as CSSOutput<InputBlocks>;
}
