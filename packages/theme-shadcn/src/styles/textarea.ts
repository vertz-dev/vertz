import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type TextareaBlocks = { base: StyleEntry[] };

/** Create textarea css() styles. */
export function createTextarea(): CSSOutput<TextareaBlocks> {
  const focusRing: Record<string, (string | RawDeclaration)[]> = {
    '&:focus-visible': [
      'outline-none',
      {
        property: 'outline',
        value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
      },
      { property: 'outline-offset', value: '2px' },
    ],
  };

  const s = css({
    textareaBase: [
      'flex',
      'w:full',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:transparent',
      'px:3',
      'py:2',
      'text:sm',
      'text:foreground',
      'shadow:xs',
      'transition:colors',
      {
        '&': [
          { property: 'min-height', value: '60px' },
          { property: 'field-sizing', value: 'content' },
        ],
      },
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
