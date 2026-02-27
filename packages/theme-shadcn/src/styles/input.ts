import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type InputBlocks = { base: string[] };

/** Create input css() styles. */
export function createInput(): CSSOutput<InputBlocks> {
  return css({
    base: [
      'flex',
      'h:10',
      'w:full',
      'rounded:md',
      'border:1',
      'border:input',
      'bg:background',
      'px:3',
      'py:2',
      'text:sm',
      'text:foreground',
      'focus-visible:outline-none',
      'focus-visible:ring:2',
      'focus-visible:ring:ring',
      'disabled:cursor:default',
      'disabled:opacity:0.5',
    ],
  });
}
