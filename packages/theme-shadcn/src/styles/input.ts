import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type InputBlocks = { base: StyleEntry[] };

/** Create input css() styles. */
export function createInput(): CSSOutput<InputBlocks> {
  const focusRing: Record<string, (string | RawDeclaration)[]> = {
    '&:focus-visible': [
      'outline-none',
      'border:ring',
      {
        property: 'outline',
        value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
      },
      { property: 'outline-offset', value: '2px' },
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
        '&': [
          { property: 'height', value: '2rem' },
          { property: 'padding-left', value: '0.625rem' },
          { property: 'padding-right', value: '0.625rem' },
        ],
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
